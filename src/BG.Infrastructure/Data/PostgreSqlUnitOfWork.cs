using System.Data;
using Npgsql;

namespace BG.Infrastructure.Data;

public class PostgreSqlUnitOfWork : IUnitOfWork
{
    private readonly NpgsqlConnection _connection;
    private NpgsqlTransaction? _transaction;
    private bool _disposed;

    public IDbConnection Connection => _connection;
    public IDbTransaction? Transaction => _transaction;

    public PostgreSqlUnitOfWork(PostgreSqlConnectionService connectionService)
    {
        _connection = connectionService.CreateConnection();
        _connection.Open();
    }

    public void BeginTransaction()
    {
        EnsureNotDisposed();
        if (_transaction != null)
            throw new InvalidOperationException("Transaction already started");
            
        _transaction = _connection.BeginTransaction();
    }

    public void Commit()
    {
        EnsureNotDisposed();
        if (_transaction == null)
            throw new InvalidOperationException("No transaction started");

        try
        {
            _transaction.Commit();
        }
        finally
        {
            _transaction.Dispose();
            _transaction = null;
        }
    }

    public void Rollback()
    {
        EnsureNotDisposed();
        if (_transaction == null)
            throw new InvalidOperationException("No transaction started");

        try
        {
            _transaction.Rollback();
        }
        finally
        {
            _transaction.Dispose();
            _transaction = null;
        }
    }

    private void EnsureNotDisposed()
    {
        if (_disposed)
            throw new ObjectDisposedException(nameof(PostgreSqlUnitOfWork));
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _transaction?.Dispose();
        _connection.Dispose();
        _disposed = true;
    }
}