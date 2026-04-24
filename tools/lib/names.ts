export function packageDirName(moduleName: string): string {
  return moduleName.replace(/^@monark\//, "")
}

export function pascalCase(kebab: string): string {
  return kebab
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

export function camelCase(kebab: string): string {
  const pascal = pascalCase(kebab)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

export function moduleEventsTypeName(moduleName: string): string {
  return `${pascalCase(packageDirName(moduleName))}Events`
}

export function moduleRouterName(moduleName: string): string {
  return `${camelCase(packageDirName(moduleName))}Router`
}

export function routerKey(moduleName: string): string {
  return camelCase(packageDirName(moduleName))
}
