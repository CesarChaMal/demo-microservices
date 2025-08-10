// HTTP API (payload v2.0) handler
export const handler = async (event) => {
  const path = event.rawPath || "/";
  const method = (event.requestContext?.http?.method || "GET").toUpperCase();

  const json = (statusCode, body) => ({
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (method === "GET" && path === "/info") {
    return json(200, { app: "node-service", status: "running" });
  }

  if (method === "POST" && path === "/process") {
    let payload;
    try { payload = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Invalid JSON" }); }

    if (typeof payload.value !== "number") {
      return json(400, { error: "Value must be a number" });
    }
    return json(200, { result: payload.value * 2 });
  }

  return json(404, { error: "Not found" });
};
