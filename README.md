# GEE Pro: Google Earth Engine Professional IDE for VS Code

![GEE Pro Logo](media/logo.png)

**GEE Pro** is a high-performance, local development environment for Google Earth Engine. Stop fighting with browser tabs and start coding like a pro with the full power of Visual Studio Code.

## 🚀 Key Features

- **Interactive Map View**: Real-time Leaflet-based visualization. Add layers, set center, and inspect coordinates with one click.
- **GEE Shell (Linux-style)**: Manage your cloud assets using familiar terminal commands like `ls`, `cd`, `pwd`, `mkdir`, `cp`, and `mv`.
- **Smart Execution**: Run your full script or just the current selection with `Cmd + Enter`. Persistent context keeps your variables alive between runs.
- **Secure Authentication**: Your credentials are encrypted using VS Code's SecretStorage (System Keychain).
- **AI-Powered Coding**: Integrated chat assistant designed to help you write complex geospatial algorithms (Beta).

## 🛠️ Installation & Setup

1. Search for **GEE Pro** in the VS Code Marketplace and click **Install**.
2. Open the Command Palette (`Cmd+Shift+P`) and run **`GEE Pro: Start Environment`**.

### 🔑 Authentication Options

#### Option A: Quick Login (Recommended for Personal Use)
*Coming soon!* We are working on a 1-click Google Sign-in.

#### Option B: Service Account (Pro & Enterprise)
If you prefer using a Service Account (highly recommended for production):
1. Go to the [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts).
2. Create a Service Account and grant it **Earth Engine Resource Viewer/Writer** roles.
3. Create a **JSON Key** and download it.
4. In VS Code, run **`GEE Pro: Authenticate`** and paste the JSON content.

## 📖 Quick Start

Create a `.js` file and start coding:

```javascript
// Set center and load data
Map.setCenter(-75, -10, 5);
const image = ee.Image('USGS/SRTMGL1_003');

// Add to interactive map
Map.addLayer(image, {min: 0, max: 3000}, 'Elevation');

print('GEE Pro is ready!');
```

## 🛡️ Privacy & Security
GEE Pro handles your credentials securely. We never store your JSON files in plain text. Everything is managed through the official Google Earth Engine API and VS Code's encrypted storage.

---
Developed with ❤️ for the Geospatial Community.
