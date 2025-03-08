# bg-backend

## create contract
```bash	
export NODE_TLS_REJECT_UNAUTHORIZED=0
npx openapi-typescript https://localhost:7088/openapi/v1.json -o ./../frontend/map/src/api/types/apiSchema.ts --enum
```