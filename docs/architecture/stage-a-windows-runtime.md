# Stage A — Windows desktop runtime prototype

Stage A packages the existing React/Vite application in a Tauri 2 Windows
host. The existing Dexie/IndexedDB repository remains the financial
application's persistence layer; the Rust database described here is an
isolated prototype only.

## Run and build

Prerequisites are Node.js/npm, Rust/Cargo with the Windows MSVC toolchain, and
the WebView2 runtime.

```text
npm install
npm run dev
npm run build
npm run desktop:dev
npm run desktop:build
```

`npm run desktop:dev` starts Vite and opens the native Aether window.
`npm run desktop:build` runs the browser production build and produces Windows
bundles configured for MSI and NSIS.

## Prototype boundary

The Rust host exposes only these typed commands to the `main` window:

- `prototype_status` checks the isolated database and returns runtime status
  plus the loopback health URL.
- `prototype_round_trip` validates a small record DTO, inserts/upserts one
  prototype record in a parameterized SQLite transaction, and retrieves it.
- `prototype_get_record` validates an ID and retrieves one prototype record.

No command accepts SQL, filesystem paths, shell commands, or arbitrary
capabilities. SQLite access stays in Rust. The database is
`stage-a-prototype.sqlite3` under Tauri's per-user application data directory.
Each connection enables and verifies `PRAGMA foreign_keys=ON`.

The health endpoint binds to `127.0.0.1` on an ephemeral port and serves only
`GET /health` and `GET /status`. It is not bound to a LAN interface and does
not expose database operations, pairing, synchronization, or credentials.

The capability grants only `core:default` to the `main` window. The React
status panel is a runtime proof of the typed command boundary and is absent
from ordinary browser mode.

## Limitations

This prototype does not migrate Dexie data, replace the financial repository,
dual-write, implement the Phase 2.2 schema, or add Android/synchronization
features. Native build and launch require the Rust and Windows dependencies
listed above.
