



# apply migration
```bash
export PATH="$PATH:/c/Program Files/AtlasGo" && \
atlas migrate hash --dir "file://backend/sql/migrations" && \
atlas migrate apply --dir "file://backend/sql/migrations" --url "postgres://postgres:postgres@localhost:5431/browsergame?sslmode=disable"
```

```bash
atlas migrate apply --dir "file://backend/sql/migrations" --url "postgres://postgres:postgres@localhost:5431/browsergame?sslmode=disable"
```