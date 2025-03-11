# bg-backend

## create contract
https://openapi-ts.dev/cli
```bash	
export NODE_TLS_REJECT_UNAUTHORIZED=0
npx openapi-typescript https://localhost:7088/openapi/v1.json -o ./../frontend/map/src/api/types/apiSchema.ts --enum
npx openapi-typescript https://localhost:7088/openapi/v1.json -o ./../frontend/map/src/api/types/apiSchema.ts --enum --make-paths-enum
```

create contract with path params as types; not really helpful i guess
`npx openapi-typescript https://localhost:7088/openapi/v1.json -o ./../frontend/map/src/api/types/apiSchema.ts --enum --path-params-as-types`
```
    "/api/v1/worlds/{worldId}/join": {
    [path: `/api/v1/worlds/${string}/join`]: {
```