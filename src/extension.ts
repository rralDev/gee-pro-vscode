import * as vscode from 'vscode';
import * as https from 'https';
import { MapView } from './views/mapView';
import { ConsoleView } from './views/consoleView';
import { GEERuntime } from './geeRuntime';
import { AssetExplorerProvider } from './views/assetExplorer';
import { AIView } from './views/aiView';

async function exchangeCodeForToken(code: string): Promise<any> {
    const CLIENT_ID = 'REDACTED_CLIENT_ID';
    const CLIENT_SECRET = 'REDACTED_CLIENT_SECRET';
    const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

    const data = new URLSearchParams({
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
    }).toString();

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const response = JSON.parse(body);
                if (res.statusCode === 200) {
                    // Include client info for future refreshes
                    resolve({ ...response, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
                } else reject(new Error(`Google error ${res.statusCode}: ${body}`));
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('GEE Pro is now active!');

    // Fix for EROFS: Set a writable directory for Earth Engine's internal sync requests
    const storagePath = context.globalStorageUri.fsPath;
    if (!require('fs').existsSync(storagePath)) {
        require('fs').mkdirSync(storagePath, { recursive: true });
    }
    process.env.TMPDIR = storagePath;
    process.chdir(storagePath); // Ensure CWD is writable for node-xmlhttprequest

    const assetProvider = new AssetExplorerProvider();
    vscode.window.registerTreeDataProvider('gee-pro-assets', assetProvider);

    let mapView: MapView | undefined;
    let consoleView: ConsoleView | undefined;
    let aiView: AIView | undefined;
    let runtime: GEERuntime | undefined;

    let startCommand = vscode.commands.registerCommand('gee-pro.start', async () => {
        // 1. Force the professional 2x2 grid layout
        await vscode.commands.executeCommand('vscode.setEditorLayout', {
            orientation: 0, // Horizontal split first
            groups: [
                { groups: [{}, {}], size: 0.5 }, // Left column (Editor Top, Console Bottom)
                { groups: [{}, {}], size: 0.5 }  // Right column (Map Top, AI Bottom)
            ]
        });

        // 2. Open the demo script on the Top-Left (Column One)
        const demoPath = vscode.Uri.file(context.asAbsolutePath('demos/welcome_to_gee_pro.js'));
        const doc = await vscode.workspace.openTextDocument(demoPath);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });

        // 3. Initialize and show views in their respective grid positions
        if (!consoleView) {
            consoleView = new ConsoleView(context);
            consoleView.onMessage(async (message: any) => {
                if (message.command === 'geeCommand' && runtime) {
                    runtime.handleCommand(message.text);
                }
            });
        }
        // Console Bottom-Left (Column Two in this grid configuration)
        consoleView.show(vscode.ViewColumn.Two);

        if (!mapView) {
            mapView = new MapView(context);
            mapView.onMessage(async (message: any) => {
                if (message.command === 'mapClick') {
                    const coords = `[${message.lng.toFixed(6)}, ${message.lat.toFixed(6)}]`;
                    if (consoleView) consoleView.append(`Map Click: ${coords}`);
                    const action = await vscode.window.showInformationMessage(`Coords: ${coords}`, 'Insert at Cursor');
                    if (action === 'Insert at Cursor') {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) editor.edit(edit => edit.insert(editor.selection.active, coords));
                    }
                }
            });
        }
        // Map Top-Right (Column Three)
        mapView.show(vscode.ViewColumn.Three);

        if (!aiView) aiView = new AIView(context);
        // AI Assistant Bottom-Right (Column Four)
        aiView.show(vscode.ViewColumn.Four);

        // 4. Runtime initialization
        if (!runtime) {
            runtime = new GEERuntime(consoleView, mapView);
            const savedJson = await context.secrets.get('gee-pro.credentials');
            if (savedJson) {
                try {
                    if (consoleView) consoleView.append('Loading GEE session...');
                    await runtime.initialize(JSON.parse(savedJson));
                    if (consoleView) consoleView.append('GEE Ready!');
                } catch (e: any) {
                    if (consoleView) consoleView.append(`Session error: ${e.message}`);
                }
            } else {
                if (consoleView) consoleView.append('Authentication required: Cmd+Shift+P -> GEE Pro: Login with Google');
            }
        }

        vscode.window.showInformationMessage('GEE Pro: Workspace Ready');
    });

    let authCommand = vscode.commands.registerCommand('gee-pro.authenticate', async () => {
        const json = await vscode.window.showInputBox({
            prompt: 'Paste your Service Account JSON here',
            ignoreFocusOut: true
        });

        if (json) {
            try {
                const creds = JSON.parse(json);
                if (runtime) {
                    await runtime.initialize(creds);
                    // Save for next time
                    await context.secrets.store('gee-pro.credentials', json);
                    vscode.window.showInformationMessage('GEE Authenticated and Saved Successfully');
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Auth Failed: ${err.message}`);
            }
        }
    });

    let loginCommand = vscode.commands.registerCommand('gee-pro.login', async () => {
        const CLIENT_ID = 'REDACTED_CLIENT_ID';
        const SCOPES = 'https://www.googleapis.com/auth/earthengine https://www.googleapis.com/auth/cloud-platform';
        
        // OAuth URL with offline access to get a refresh token
        const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent`;
        
        const selection = await vscode.window.showInformationMessage(
            'GEE Pro: Authenticating with your Google Account...',
            'Open Browser',
            'Cancel'
        );

        if (selection === 'Open Browser') {
            await vscode.env.openExternal(vscode.Uri.parse(authUrl));
            
            const code = await vscode.window.showInputBox({
                prompt: 'Paste the Authorization Code provided by Google here',
                ignoreFocusOut: true,
                password: true
            });

            if (code) {
                try {
                    if (consoleView) consoleView.append('Verifying with Google...');
                    
                    const tokenData = await exchangeCodeForToken(code);
                    
                    if (runtime) {
                        await runtime.initialize(tokenData);
                        await context.secrets.store('gee-pro.credentials', JSON.stringify(tokenData));
                        
                        vscode.window.showInformationMessage('GEE Pro: Login Successful!');
                        if (consoleView) consoleView.append('Welcome! Your session is now active and securely saved.');
                    }
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Login Failed: ${err.message}`);
                    if (consoleView) consoleView.append(`Auth Error: ${err.message}`);
                }
            }
        }
    });

    let runCommand = vscode.commands.registerCommand('gee-pro.run', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && runtime) {
            const code = editor.document.getText();
            if (consoleView) consoleView.append(`Running full script...`);
            runtime.execute(code);
        }
    });

    let runSelectionCommand = vscode.commands.registerCommand('gee-pro.runSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && runtime) {
            const selection = editor.selection;
            const code = selection.isEmpty ? editor.document.lineAt(selection.active.line).text : editor.document.getText(selection);
            
            if (consoleView) consoleView.append(`Running selection...`);
            runtime.execute(code);
            
            // Move cursor to next line if it was a single line run
            if (selection.isEmpty) {
                const nextLine = selection.active.line + 1;
                if (nextLine < editor.document.lineCount) {
                    const newPos = new vscode.Position(nextLine, 0);
                    editor.selection = new vscode.Selection(newPos, newPos);
                }
            }
        }
    });

    context.subscriptions.push(startCommand, authCommand, loginCommand, runCommand, runSelectionCommand);
}

export function deactivate() {}
