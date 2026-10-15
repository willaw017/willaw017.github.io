const SIMPLE_ROUTES = new Set(["today", "plan", "profile", "pick-date", "calendar"]);
const PARAMETER_ROUTES = {
  ask: new Set(["career", "relationships", "money", "support"]),
  chart: new Set(["overview", "career", "money", "relationships"])
};

export function normalizeRoute(hash = "") {
  const [name = "today", param] = hash.replace(/^#\/?/, "").split("/");
  if (SIMPLE_ROUTES.has(name)) return { name };
  if (PARAMETER_ROUTES[name]?.has(param)) return { name, param };
  return { name: "today" };
}

export function routeToHash(route) {
  return route.param ? `#/${route.name}/${route.param}` : `#/${route.name}`;
}

export function primaryRoute(route) {
  if (["pick-date", "calendar", "plan"].includes(route.name)) return "plan";
  if (route.name === "profile") return "profile";
  return "today";
}
