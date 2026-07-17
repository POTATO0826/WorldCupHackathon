import { useEffect, useState } from "react";

export interface Route {
  path: string;
  parts: string[];
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const path = hash.startsWith("/") ? hash : `/${hash}`;
  return { path, parts: path.split("/").filter(Boolean) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = path;
}
