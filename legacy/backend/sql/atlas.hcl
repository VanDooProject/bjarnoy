env "local" {
  url = "postgres://postgres:postgres@localhost:5432/browsergame?sslmode=disable"
  migration {
    dir = "migrations"
  }
}

env "ci" {
  url = getenv("SERVICE_DB_URL")
  migration {
    dir = "file://migrations"
  }
}