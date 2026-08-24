using System.Data;

namespace BG.Infrastructure.Data;

public interface IUnitOfWork : IDisposable
{
    IDbConnection Connection { get; }
    IDbTransaction? Transaction { get; }
    
    void BeginTransaction();
    void Commit();
    void Rollback();
}