use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::Arc,
    thread,
    time::Duration,
};
use tauri::{Manager, State};
use thiserror::Error;

const DATABASE_FILE: &str = "stage-a-prototype.sqlite3";

#[derive(Debug, Error)]
enum CommandError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("filesystem error: {0}")]
    Filesystem(#[from] std::io::Error),
}

impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Clone)]
struct AppState {
    database_path: Arc<PathBuf>,
    health_addr: SocketAddr,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrototypeRecordInput {
    id: Option<String>,
    label: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrototypeRecord {
    id: String,
    label: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrototypeStatus {
    runtime: &'static str,
    health_url: String,
    database_ready: bool,
}

fn validate_record_input(input: &PrototypeRecordInput) -> Result<(), CommandError> {
    let label = input.label.trim();
    if label.is_empty() || label.chars().count() > 120 {
        return Err(CommandError::InvalidInput(
            "label must contain 1 to 120 characters".to_string(),
        ));
    }
    if let Some(id) = &input.id {
        validate_record_id(id)?;
    }
    Ok(())
}

fn validate_record_id(id: &str) -> Result<(), CommandError> {
    if id.is_empty()
        || id.chars().count() > 80
        || !id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
        })
    {
        return Err(CommandError::InvalidInput(
            "id must contain only ASCII letters, numbers, '-' or '_'".to_string(),
        ));
    }
    Ok(())
}

fn open_database(path: &Path) -> Result<Connection, CommandError> {
    let connection = Connection::open(path)?;
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    let enabled: i64 = connection.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    if enabled != 1 {
        return Err(CommandError::Database(rusqlite::Error::InvalidQuery));
    }
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS prototype_records (
            id TEXT PRIMARY KEY NOT NULL,
            label TEXT NOT NULL CHECK(length(trim(label)) > 0),
            created_at TEXT NOT NULL
        ) STRICT;",
    )?;
    Ok(connection)
}

fn read_record(connection: &Connection, id: &str) -> Result<PrototypeRecord, CommandError> {
    connection
        .query_row(
            "SELECT id, label, created_at FROM prototype_records WHERE id = ?1",
            [id],
            |row| {
                Ok(PrototypeRecord {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    created_at: row.get(2)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| CommandError::InvalidInput("prototype record was not found".to_string()))
}

fn handle_health(mut stream: TcpStream) -> Result<(), CommandError> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let mut request = [0_u8; 1024];
    let size = stream.read(&mut request)?;
    let request = String::from_utf8_lossy(&request[..size]);
    let status = if request.starts_with("GET /health ") || request.starts_with("GET /status ") {
        "200 OK"
    } else {
        "404 Not Found"
    };
    let body = if status == "200 OK" {
        r#"{"status":"ok","runtime":"aether-tauri"}"#
    } else {
        r#"{"error":"not found"}"#
    };
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    Ok(())
}

fn start_health_endpoint() -> Result<SocketAddr, CommandError> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let address = listener.local_addr()?;
    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let _ = handle_health(stream);
                }
                Err(_) => break,
            }
        }
    });
    Ok(address)
}

#[tauri::command]
fn prototype_status(state: State<'_, AppState>) -> Result<PrototypeStatus, CommandError> {
    open_database(&state.database_path)?;
    Ok(PrototypeStatus {
        runtime: "tauri-windows",
        health_url: format!("http://{}", state.health_addr),
        database_ready: true,
    })
}

#[tauri::command]
fn prototype_round_trip(
    state: State<'_, AppState>,
    input: PrototypeRecordInput,
) -> Result<PrototypeRecord, CommandError> {
    validate_record_input(&input)?;
    let id = input.id.unwrap_or_else(|| "stage-a-test-record".to_string());
    let label = input.label.trim().to_string();
    let mut connection = open_database(&state.database_path)?;
    let transaction = connection.unchecked_transaction()?;
    transaction.execute(
        "INSERT INTO prototype_records (id, label, created_at)
         VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(id) DO UPDATE SET label = excluded.label",
        params![id, label],
    )?;
    let record = read_record(&transaction, &id)?;
    transaction.commit()?;
    Ok(record)
}

#[tauri::command]
fn prototype_get_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<PrototypeRecord, CommandError> {
    validate_record_id(&id)?;
    let connection = open_database(&state.database_path)?;
    read_record(&connection, &id)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let database_path = app_data_dir.join(DATABASE_FILE);
            open_database(&database_path)?;
            let health_addr = start_health_endpoint()?;
            app.manage(AppState {
                database_path: Arc::new(database_path),
                health_addr,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            prototype_status,
            prototype_round_trip,
            prototype_get_record
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aether Finance");
}
