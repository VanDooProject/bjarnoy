using Npgsql;
using BG.Infrastructure.Data;

namespace BG.Infrastructure.Repositories.PostgreSQL;

public abstract class BasePostgreSqlRepository
{
    protected readonly IUnitOfWork UnitOfWork;

    protected BasePostgreSqlRepository(IUnitOfWork unitOfWork)
    {
        UnitOfWork = unitOfWork;
    }

    protected NpgsqlConnection Connection => (NpgsqlConnection)UnitOfWork.Connection;
}
