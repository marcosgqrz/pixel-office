FROM node:20-slim

WORKDIR /app

# Install root dependencies (including devDeps needed for build)
COPY package*.json ./
RUN npm install

# Install webview-ui dependencies
COPY webview-ui/package*.json ./webview-ui/
RUN cd webview-ui && npm install

# Copy all source files
COPY . .

# Build server (esbuild) + UI (vite)
RUN npm run build

EXPOSE 3456

CMD ["node", "dist/server.js"]
