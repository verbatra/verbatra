export declare function isEnvFile(path: string): boolean;

export declare function isBuildOnlyFile(appRelativePath: string): boolean;

export declare function tracedBuildOnlyFiles(appDir: string): Promise<string[]>;

export declare function standaloneBuildOnlyFiles(
  appDir: string,
  appPath: string,
): Promise<string[]>;

export declare function removeStandaloneEnvFiles(appDir: string): Promise<string[]>;
