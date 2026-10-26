function scrubSentryEvent(event) {
  if (event.request) {
    const method = event.request.method;
    const rawUrl = event.request.url;
    const path = typeof rawUrl === "string" ? rawUrl.split(/[?#]/, 1)[0] : undefined;
    event.request = {
      ...(typeof method === "string" ? { method } : {}),
      ...(path ? { url: path } : {}),
    };
  }
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  return event;
}

module.exports = { scrubSentryEvent };
