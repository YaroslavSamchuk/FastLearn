interface PagesEnv {
  FASTLEARN_API: {
    fetch(request: Request): Promise<Response>;
  };
}

export async function onRequest(context: {
  request: Request;
  env: PagesEnv;
}): Promise<Response> {
  const incoming = new URL(context.request.url);
  const upstream = new URL(incoming.pathname + incoming.search, 'https://fastlearn.samchukyaroslav.workers.dev');
  const headers = new Headers(context.request.headers);
  headers.set('X-FastLearn-Origin', incoming.origin);

  const forwardedRequest = new Request(upstream, {
    method: context.request.method,
    headers,
    body: context.request.method === 'GET' || context.request.method === 'HEAD'
      ? undefined
      : context.request.body,
    redirect: 'manual'
  });

  return context.env.FASTLEARN_API.fetch(forwardedRequest);
}
