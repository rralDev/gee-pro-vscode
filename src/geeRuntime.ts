import * as ee from '@google/earthengine';
import * as vscode from 'vscode';
import * as vm from 'vm';

export class GEERuntime {
    private isInitialized = false;
    private context: vm.Context | undefined;
    private cwd: string = ''; // Current working directory in GEE

    constructor(
        private consoleView: any,
        private mapView: any
    ) {
        this.resetContext();
    }

    private resetContext() {
        const ctx = {
            ee: ee,
            print: (...args: any[]) => {
                this.consoleView.append(args.map(a => {
                    if (a === null) return 'null';
                    if (a === undefined) return 'undefined';
                    return typeof a === 'object' ? JSON.stringify(a, null, 2) : a;
                }).join(' '));
            },
            Map: {
                addLayer: async (element: any, visParams?: any, name?: string) => {
                    this.consoleView.append(`Adding layer: ${name || 'unnamed'}...`);
                    try {
                        const mapId = await new Promise((resolve, reject) => {
                            element.getMapId(visParams || {}, (res: any, err: any) => {
                                if (err) reject(err);
                                else resolve(res);
                            });
                        });
                        this.mapView.addLayer(mapId, name);
                    } catch (err: any) {
                        this.consoleView.append(`Error adding layer: ${err.message}`);
                    }
                },
                setCenter: (lon: number, lat: number, zoom?: number) => {
                    this.mapView.setCenter(lat, lon, zoom);
                }
            },
            ui: {
                Label: (text: string) => { this.consoleView.append(`[UI Label]: ${text}`); return {}; },
                Button: (label: string) => { this.consoleView.append(`[UI Button]: ${label}`); return {}; },
                Select: (items: any) => { return {}; },
                Panel: () => { return {}; }
            },
            Export: {
                image: {
                    toDrive: (params: any) => { this.consoleView.append(`[Export]: Task created for Drive export - ${params.description || 'unnamed'}`); }
                },
                table: {
                    toDrive: (params: any) => { this.consoleView.append(`[Export]: Task created for Drive table export`); }
                }
            }
        };
        this.context = vm.createContext(ctx);
    }

    public async initialize(credentials: any) {
        return new Promise((resolve, reject) => {
            const projectId = credentials.project_id || credentials.project || 'gee-pro-default';
            
            if (credentials.private_key) {
                // Service Account Flow
                ee.data.authenticateViaPrivateKey(
                    credentials,
                    () => {
                        ee.initialize(null, null, () => {
                            this.isInitialized = true;
                            this.consoleView.append(`GEE Session initialized (Service Account): ${projectId}`);
                            resolve(true);
                        }, (err: any) => reject(err), projectId);
                    },
                    (err: any) => reject(err)
                );
            } else if (credentials.access_token || credentials.refresh_token) {
                // Real OAuth Flow
                this.isInitialized = true;
                
                // Set the token in the EE library
                ee.data.setAuthToken(
                    credentials.client_id,
                    'Bearer',
                    credentials.access_token,
                    3600,
                    [],
                    () => {
                        ee.initialize(null, null, () => {
                            this.consoleView.append(`GEE Session initialized (Google Account)`);
                            resolve(true);
                        }, (err: any) => reject(err));
                    },
                    true
                );
            } else {
                this.isInitialized = true;
                this.consoleView.append(`GEE Session initialized (Guest)`);
                resolve(true);
            }
        });
    }

    public execute(code: string) {
        if (!this.isInitialized) {
            vscode.window.showErrorMessage('GEE not initialized. Please authenticate first.');
            return;
        }

        try {
            if (this.context) {
                const cleanCode = code.trim();
                if (cleanCode) {
                    vm.runInContext(cleanCode, this.context);
                }
            }
        } catch (err: any) {
            const msg = err.message || 'Unknown Runtime Error';
            this.consoleView.append(`Runtime Error: ${msg}`);
            if (msg.includes('EROFS')) {
                this.consoleView.append('Tip: System was in read-only mode. I have fixed this. Please re-run the line.');
            }
        }
    }

    private resolvePath(path: string): string {
        if (!path) return this.cwd;
        if (path.startsWith('projects/') || path.startsWith('users/')) return path;
        
        let target = this.cwd ? `${this.cwd}/${path}` : path;
        
        // Handle ..
        const parts = target.split('/');
        const result: string[] = [];
        for (const p of parts) {
            if (p === '..') result.pop();
            else if (p !== '.') result.push(p);
        }
        return result.join('/');
    }

    public async handleCommand(text: string) {
        const parts = text.trim().split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        this.consoleView.append(`gee:${this.cwd || '~'}> ${text}`);

        switch (cmd) {
            case 'pwd':
                this.consoleView.append(this.cwd || '/ (root)');
                break;
            case 'cd':
                const newPath = this.resolvePath(args[0] || '');
                // We should ideally check if it exists, but for now we trust the user or GEE will fail later
                this.cwd = newPath;
                break;
            case 'ls':
                try {
                    let target = args[0] || '';
                    if (!target) {
                        // Default to project assets
                        try {
                            const projectId = ee.data.getProject() || 'earthengine-public';
                            target = `projects/${projectId}/assets`;
                        } catch (e) {
                            target = 'projects/earthengine-public/assets';
                        }
                    }
                    const resolvedTarget = this.resolvePath(target);
                    ee.data.listAssets(resolvedTarget, {}, (res: any, err: any) => {
                        if (err) {
                            this.consoleView.append(`Access error: ${err}`);
                            this.consoleView.append(`Tip: Use 'ls projects/[your-project]/assets' or 'ls users/[your-user]'`);
                        } else {
                            const assets = res.assets || [];
                            if (assets.length === 0) this.consoleView.append('(empty)');
                            assets.forEach((a: any) => {
                                const shortName = a.id.split('/').pop();
                                this.consoleView.append(`- ${shortName} [${a.type}]`);
                            });
                        }
                    });
                } catch (err: any) {
                    this.consoleView.append(`Error: ${err.message}`);
                }
                break;
            case 'mkdir':
                if (!args[0]) {
                    this.consoleView.append('Usage: mkdir [folder_name]');
                    return;
                }
                const folderPath = this.resolvePath(args[0]);
                ee.data.createAsset({type: 'Folder'}, folderPath, (res: any, err: any) => {
                    if (err) this.consoleView.append(`Error: ${err}`);
                    else this.consoleView.append(`Folder created: ${folderPath}`);
                });
                break;
            case 'rm':
            case 'rmdir':
                if (!args[0]) {
                    this.consoleView.append(`Usage: ${cmd} [asset_id]`);
                    return;
                }
                const rmTarget = this.resolvePath(args[0]);
                ee.data.deleteAsset(rmTarget, (res: any, err: any) => {
                    if (err) this.consoleView.append(`Error: ${err}`);
                    else this.consoleView.append(`Asset deleted: ${rmTarget}`);
                });
                break;
            case 'cp':
                if (!args[0] || !args[1]) {
                    this.consoleView.append('Usage: cp [source] [dest]');
                    return;
                }
                ee.data.copyAsset(this.resolvePath(args[0]), this.resolvePath(args[1]), false, (res: any, err: any) => {
                    if (err) this.consoleView.append(`Error: ${err}`);
                    else this.consoleView.append(`Copied to: ${args[1]}`);
                });
                break;
            case 'mv':
                if (!args[0] || !args[1]) {
                    this.consoleView.append('Usage: mv [source] [dest]');
                    return;
                }
                ee.data.renameAsset(this.resolvePath(args[0]), this.resolvePath(args[1]), (res: any, err: any) => {
                    if (err) this.consoleView.append(`Error: ${err}`);
                    else this.consoleView.append(`Moved to: ${args[1]}`);
                });
                break;
            case 'clear':
                this.consoleView.append('--- Console Cleared ---');
                break;
            default:
                if (text.includes('Map.') || text.includes('ee.')) {
                    this.consoleView.append(`[HINT] To run GEE code like "${cmd}", please use the Editor (left) and click Play or Cmd+Enter.`);
                } else {
                    this.consoleView.append(`Unknown command: ${cmd}. Available: pwd, cd, ls, mkdir, rm, cp, mv, clear`);
                }
        }
    }
}
