import { defineConfig } from 'vitest/config';
import { workspaceResolve } from '../../scripts/workspaceResolve.ts';

// The workspace's engine and kit from source, not their built `dist`.
export default defineConfig({ ...workspaceResolve });
