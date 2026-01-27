FROM node:18-alpine

WORKDIR /app

# Install thrift compiler
RUN apk add --no-cache thrift

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY jest.config.js ./

# Install dependencies
RUN npm ci

# Copy thrift files first
COPY thrift/ ./thrift/

# Generate thrift files
RUN mkdir -p src/thrift/generated && \
    thrift --gen js:node -out src/thrift/generated thrift/client.thrift && \
    thrift --gen js:node -out src/thrift/generated thrift/common.thrift

# Copy source and test files
COPY src/ ./src/
COPY tests/ ./tests/

# Build the project
RUN npm run build

# Run E2E tests
CMD ["npm", "run", "test:e2e"]
