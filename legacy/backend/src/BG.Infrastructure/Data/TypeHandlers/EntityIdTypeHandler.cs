using System.Data;
using BG.Core.ValueObjects;
using Dapper;

namespace BG.Infrastructure.Data.TypeHandlers;

public class EntityIdTypeHandler : SqlMapper.TypeHandler<EntityId>
{
    public override EntityId Parse(object value)
    {
        return new EntityId(value as byte[] ?? Array.Empty<byte>());
    }

    public override void SetValue(IDbDataParameter parameter, EntityId value)
    {
        parameter.Value = value.ToByteArray();
        parameter.DbType = DbType.Binary;
    }
}