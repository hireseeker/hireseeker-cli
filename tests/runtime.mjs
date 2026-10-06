
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const runtimeRoot = process.env.HIRESEEKER_TEST_ROOT || fileURLToPath(new URL('../', import.meta.url));
export const load = module => import(pathToFileURL(join(runtimeRoot, 'dist', `${module}.js`)).href);
