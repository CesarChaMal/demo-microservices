# Use an official Python runtime as a parent image, specifying the exact version to ensure consistency across environments.
FROM python:3.8

# Set the working directory inside the container to /app.
# This directory will be the default location for all subsequent commands.
WORKDIR /app

# Copy the requirements file into the container at /app.
# This file lists all the Python packages that the application depends on.
COPY requirements.txt .

# Install any needed packages specified in requirements.txt.
# This is done before copying the entire application to take advantage of cached Docker layers.
RUN pip install -r requirements.txt

# Copy the rest of the application's source code into the container at /app.
# This step is performed after installing dependencies to ensure that changes to the application's source code don't invalidate the Docker cache of the installed packages.
COPY . .

# Run the application when the container launches.
# This command runs the Python application that is expected to be named app.py.
CMD ["python", "app.py"]
