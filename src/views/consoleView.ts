import * as vscode from 'vscode';

export class ConsoleView {
    private panel: vscode.WebviewPanel | undefined;
    private messageCallback: ((message: any) => void) | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    public onMessage(callback: (message: any) => void) {
        this.messageCallback = callback;
    }

    public show(column: vscode.ViewColumn) {
        if (this.panel) {
            this.panel.reveal(column);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'geeConsole',
                'GEE Console',
                column,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.webview.html = this.getHtml();
            
            this.panel.webview.onDidReceiveMessage(message => {
                if (this.messageCallback) this.messageCallback(message);
            }, undefined, this.context.subscriptions);

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null, this.context.subscriptions);
        }
    }

    public append(text: string) {
        if (this.panel) {
            this.panel.webview.postMessage({ command: 'append', text });
        }
    }

    private getHtml() {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>GEE Console</title>
                <style>
                    body { 
                        background: #1e1e1e; 
                        color: #d4d4d4; 
                        font-family: 'Consolas', monospace; 
                        font-size: 13px;
                        padding: 10px;
                        margin: 0;
                    }
                    .log-entry { margin-bottom: 5px; border-left: 2px solid #555; padding-left: 10px; }
                    .timestamp { color: #888; font-size: 11px; margin-right: 10px; }
                    .info { color: #569cd6; }
                </style>
            </head>
            <body>
                <div id="console"></div>
                <div class="input-container">
                    <span class="prompt">gee></span>
                    <input type="text" id="cmd-input" placeholder="ls, rm, cp, mv..." />
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const consoleDiv = document.getElementById('console');
                    const cmdInput = document.getElementById('cmd-input');

                    cmdInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            const cmd = cmdInput.value;
                            if (cmd) {
                                vscode.postMessage({ command: 'geeCommand', text: cmd });
                                cmdInput.value = '';
                            }
                        }
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'append') {
                            const entry = document.createElement('div');
                            entry.className = 'log-entry';
                            const ts = new Date().toLocaleTimeString();
                            entry.innerHTML = '<span class="timestamp">' + ts + '</span><span class="info">[INFO]</span> ' + message.text;
                            consoleDiv.appendChild(entry);
                            window.scrollTo(0, document.body.scrollHeight);
                        }
                    });
                </script>
                <style>
                    body { 
                        background: #1e1e1e; 
                        color: #d4d4d4; 
                        font-family: 'Consolas', monospace; 
                        font-size: 13px;
                        padding: 0;
                        margin: 0;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        overflow: hidden;
                    }
                    #console { 
                        flex: 1; 
                        overflow-y: auto; 
                        padding: 10px;
                        padding-bottom: 50px;
                    }
                    .log-entry { margin-bottom: 5px; border-left: 2px solid #555; padding-left: 10px; }
                    .timestamp { color: #888; font-size: 11px; margin-right: 10px; }
                    .info { color: #569cd6; }
                    
                    .input-container {
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        background: #333;
                        display: flex;
                        align-items: center;
                        padding: 8px 15px;
                        border-top: 2px solid #007acc; /* Borde azul llamativo */
                        box-shadow: 0 -5px 15px rgba(0,0,0,0.3);
                    }
                    .prompt { color: #4ec9b0; font-weight: bold; margin-right: 10px; }
                    #cmd-input {
                        background: transparent;
                        border: none;
                        color: #fff;
                        flex: 1;
                        outline: none;
                        font-family: 'Consolas', monospace;
                        font-size: 14px;
                    }
                </style>
            </body>
            </html>
        `;
    }
}
