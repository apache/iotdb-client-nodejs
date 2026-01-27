FROM node:18-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies
RUN npm install

# Build the project (this will copy thrift generated files to dist)
RUN npm run build

# Run E2E tests
CMD ["npm", "run", "test:e2e"]
