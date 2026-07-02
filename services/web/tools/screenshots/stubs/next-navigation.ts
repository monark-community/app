/** No-op `next/navigation` stand-ins so components that import the router
 *  hooks resolve in the harness. The hooks aren't exercised by stories. */
export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
});
export const useSearchParams = () => new URLSearchParams();
export const usePathname = () => "/";
export const useParams = () => ({});
export const redirect = () => {};
export const notFound = () => {};
