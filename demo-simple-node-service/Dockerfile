# Use the latest Node.js version based on the required major version (22.x)
FROM node:22

# Set the working directory inside the container to /app.
# This is where all files will be placed and commands will be run.
WORKDIR /app

# Copy package.json and package-lock.json to the working directory.
# This step is crucial to cache the npm install step, speeding up builds as long as dependencies don't change.
COPY package.json package-lock.json ./

# Install dependencies defined in package.json.
# This step is run separately from copying the rest of the application to take advantage of Docker's layer caching.
RUN npm install

# Copy the rest of the application's source code to the container.
# This step is performed after npm install to ensure that changes in the application's source code don't invalidate the Docker cache of the npm install layer.
COPY . .

# Command to start the application.
# This uses npm to run the script named "start" defined in package.json.
CMD ["npm", "start"]
