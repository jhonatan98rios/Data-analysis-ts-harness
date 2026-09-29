import { MongoClient } from 'mongodb';
import { after } from 'next/server';

// Traduz as assinaturas de erro do driver para a ação que resolve.
function hint(error: string): string {
  if (/tlsv1 alert internal error|alert number 80/i.test(error)) {
    return 'IP de origem recusado pelo Atlas. Adicione 0.0.0.0/0 e ::/0 em Network Access (função serverless não tem IP fixo).';
  }
  if (/ECONNREFUSED|ETIMEDOUT|Server selection timed out/i.test(error)) {
    return 'Sem rota até o cluster: cheque Network Access e se o cluster não está pausado.';
  }
  if (/Authentication failed|bad auth/i.test(error)) {
    return 'Usuário/senha da URI inválidos, ou usuário sem permissão no database.';
  }
  if (/querySrv|ENOTFOUND/i.test(error)) {
    return 'DNS SRV não resolveu: hostname da URI errado ou cluster pausado.';
  }
  return '';
}

// ponytail: rota temporária de diagnóstico. Apague depois de validar a persistência.
export const runtime = 'nodejs';

// Descarta tudo que parece credencial antes de devolver ao cliente.
function mask(uri: string): string {
  try {
    const u = new URL(uri);
    u.username = u.username ? '***' : '';
    u.password = u.password ? '***' : '';
    return u.toString();
  } catch {
    return '(uri inválida)';
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'dah';

  const env = {
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    hasMongoUri: Boolean(uri),
    mongoUriMasked: uri ? mask(uri) : null,
    uriDbPath: uri ? new URL(uri).pathname.replace(/^\//, '') || '(nenhum)' : null,
    dbUsed: dbName,
    hasDeepseekKey: Boolean(process.env.DEEPSEEK_API_KEY),
  };

  // modo 1: ?after=1 prova se o after() executa nesta plataforma.
  // Depois de chamar, procure um doc com check: "after" na colecao traces.
  if (!uri) return Response.json({ ok: false, step: 'env', env });
  if (url.searchParams.get('after') === '1') {
    after(async () => {
      const c = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      try {
        await c.connect();
        await c.db(dbName).collection('traces').insertOne({
          check: 'after',
          at: new Date(),
          commit: env.commit,
        });
      } finally {
        await c.close();
      }
    });
    return Response.json({ ok: true, step: 'after-registrado', env, proximo: 'checar colecao traces' });
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const result: Record<string, unknown> = { conectou: true };

    try {
      const { databases } = await client.db().admin().listDatabases();
      result.databases = databases.map((d) => d.name);
    } catch (e) {
      result.databases = `erro: ${e instanceof Error ? e.message : e}`;
    }

    const db = client.db(dbName);
    try {
      const col = db.collection('traces');
      const inserted = await col.insertOne({ check: 'health', at: new Date() });
      const count = await col.countDocuments();
      const sample = await col
        .find({}, { projection: { _id: 0, schemaVersion: 1, 'meta.status': 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      await col.deleteOne({ _id: inserted.insertedId });
      result.escrita = 'ok';
      result.totalDocsEmTraces = count;
      result.ultimoDoc = sample[0] ?? null;
      result.contadorIncluiHealthcheck = true;
    } catch (e) {
      result.escrita = `erro: ${e instanceof Error ? e.message : e}`;
    }

    return Response.json({ ok: true, step: 'write', env, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, step: 'connect', env, error, hint: hint(error) });
  } finally {
    await client.close();
  }
}
