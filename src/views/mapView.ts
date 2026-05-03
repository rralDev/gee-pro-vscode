import * as vscode from 'vscode';

export class MapView {
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
                'geeMap',
                'GEE Map',
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

    public addLayer(mapId: any, name?: string) {
        if (this.panel) {
            this.panel.webview.postMessage({ command: 'addLayer', mapId, name });
        }
    }

    public setCenter(lat: number, lng: number, zoom?: number) {
        if (this.panel) {
            this.panel.webview.postMessage({ command: 'setCenter', lat, lng, zoom });
        }
    }

    private getHtml() {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>GEE Map</title>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <style>
                    body { margin: 0; padding: 0; height: 100vh; background: #1e1e1e; }
                    #map { height: 100%; width: 100%; }
                    .coords-label {
                        position: absolute;
                        bottom: 10px;
                        left: 10px;
                        z-index: 1000;
                        background: rgba(0,0,0,0.7);
                        color: white;
                        padding: 5px 10px;
                        border-radius: 4px;
                        font-family: monospace;
                    }
                </style>
            </head>
            <body>
                <div id="map"></div>
                <div id="coords" class="coords-label">Lat: 0, Lng: 0</div>
                <script>
                    const map = L.map('map').setView([-12.0464, -77.0428], 5); // Lima, Peru default
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; OpenStreetMap contributors'
                    }).addTo(map);

                    const coordsDiv = document.getElementById('coords');

                    map.on('mousemove', (e) => {
                        coordsDiv.innerHTML = \`Lat: \${e.latlng.lat.toFixed(4)}, Lng: \${e.latlng.lng.toFixed(4)}\`;
                    });

                    map.on('click', (e) => {
                        // Send coords to VS Code
                        const vscode = acquireVsCodeApi();
                        vscode.postMessage({
                            command: 'mapClick',
                            lat: e.latlng.lat,
                            lng: e.latlng.lng
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'addLayer':
                                const url = message.mapId.urlFormat;
                                L.tileLayer(url, {
                                    attribution: 'Google Earth Engine'
                                }).addTo(map);
                                break;
                            case 'setCenter':
                                map.setView([message.lat, message.lng], message.zoom || 10);
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}
