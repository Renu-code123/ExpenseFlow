
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built static project into nginx
COPY . /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# 5. Run nginx in foreground (default)
CMD ["nginx", "-g", "daemon off;"]
