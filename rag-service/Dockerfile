FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PyMuPDF
RUN apt-get update && apt-get install -y \
    gcc \
    libxml2-dev \
    libxslt-dev \
    libffi-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py start.py ./

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8001

# Run the service
CMD ["python", "start.py", "--host", "0.0.0.0", "--port", "8001"]
