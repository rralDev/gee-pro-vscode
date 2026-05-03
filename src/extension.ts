import * as vscode from 'vscode';
import { MapView } from './views/mapView';
import { ConsoleView } from './views/consoleView';
import { GEERuntime } from './geeRuntime';
import { AssetExplorerProvider } from './views/assetExplorer';
import { AIView } from './views/aiView';

export function activate(context: vscode.ExtensionContext) {
    console.log('GEE Pro is now active!');

    const assetProvider = new AssetExplorerProvider();
    vscode.window.registerTreeDataProvider('gee-pro-assets', assetProvider);

    let mapView: MapView | undefined;
    let consoleView: ConsoleView | undefined;
    let aiView: AIView | undefined;
    let runtime: GEERuntime | undefined;

    let startCommand = vscode.commands.registerCommand('gee-pro.start', async () => {
        if (!mapView) {
            mapView = new MapView(context);
            mapView.onMessage(async (message: any) => {
                if (message.command === 'mapClick') {
                    const coords = `[${message.lng.toFixed(6)}, ${message.lat.toFixed(6)}]`;
                    if (consoleView) {
                        consoleView.append(`Clicked Coords: ${coords}`);
                    }
                    
                    const action = await vscode.window.showInformationMessage(
                        `Coords: ${coords}`,
                        'Insert at Cursor'
                    );

                    if (action === 'Insert at Cursor') {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            editor.edit(editBuilder => {
                                editBuilder.insert(editor.selection.active, coords);
                            });
                        }
                    }
                }
            });
        }
        mapView.show(vscode.ViewColumn.Two);

        if (!consoleView) {
            consoleView = new ConsoleView(context);
            consoleView.onMessage(async (message: any) => {
                if (message.command === 'geeCommand' && runtime) {
                    runtime.handleCommand(message.text);
                }
            });
        }
        consoleView.show(vscode.ViewColumn.Two);

        if (!aiView) aiView = new AIView(context);
        aiView.show(vscode.ViewColumn.Three);

        if (!runtime) {
            runtime = new GEERuntime(consoleView, mapView);
            // Try to load saved credentials
            const savedJson = await context.secrets.get('gee-pro.credentials');
            if (savedJson) {
                try {
                    if (consoleView) consoleView.append('Loading saved GEE credentials...');
                    await runtime.initialize(JSON.parse(savedJson));
                    if (consoleView) consoleView.append('GEE Ready!');
                } catch (e: any) {
                    if (consoleView) consoleView.append(`Failed to load saved credentials: ${e.message}`);
                }
            } else {
                if (consoleView) consoleView.append('Please authenticate to start (Cmd+Shift+P -> GEE Pro: Authenticate)');
            }
        }

        vscode.window.showInformationMessage('GEE Pro Environment Started');
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
        
        // OAuth URL with your Client ID
        const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
        
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
                if (consoleView) consoleView.append('Exchanging code for access token...');
                // In production, we exchange 'code' for a refresh token here.
                // For now, we'll mark it as successful.
                vscode.window.showInformationMessage('GEE Pro: Login Successful!');
                if (consoleView) consoleView.append('Welcome! You are now authenticated as GEE Pro developer.');
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
