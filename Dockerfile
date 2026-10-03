FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
# Dry run by default. Google key is mounted/injected at runtime, never baked in.
ENTRYPOINT ["node", "src/run.js"]
CMD ["--mode", "dry-run", "--out", "/tmp/reports"]
