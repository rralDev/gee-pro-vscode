import * as https from 'https';

import { CLIENT_ID, CLIENT_SECRET } from './config';

export async function exchangeCodeForToken(code: string): Promise<any> {
    const data = new URLSearchParams({
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
        grant_type: 'authorization_code'
    }).toString();

    return makeTokenRequest(data);
}

export async function refreshAccessToken(refreshToken: string): Promise<any> {
    const data = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token'
    }).toString();

    return makeTokenRequest(data);
}

async function makeTokenRequest(data: string): Promise<any> {
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
                    resolve({ ...response, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
                } else reject(new Error(`Google error ${res.statusCode}: ${body}`));
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
