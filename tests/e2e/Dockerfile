FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY jest.config.js ./

# Install dependencies
RUN npm ci

# Copy source and test files
COPY src/ ./src/
COPY tests/ ./tests/
COPY thrift/ ./thrift/

# Build the project
RUN npm run build

# Run E2E tests
CMD ["npm", "run", "test:e2e"]
