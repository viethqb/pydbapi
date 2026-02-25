# pyDBAPI on Kubernetes (kind)

This guide describes how to run pyDBAPI on Kubernetes using kind for dev/staging.

## 1. Create cluster with kind

The dev cluster is defined in `kind.yaml` (exposes host ports 80 and 443).

```bash
kind create cluster --config kind.yaml
kubectl get nodes -owide
```

## 2. Install NGINX Ingress Controller

Use ingress-nginx as a DaemonSet so it can bind to host ports 80/443.

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --set controller.hostNetwork=true,controller.service.type="",controller.kind=DaemonSet \
  --namespace ingress-nginx --version 4.10.1 --create-namespace --timeout 600s

kubectl -n ingress-nginx get pods -owide
```

## 3. Install PostgreSQL

PostgreSQL is installed via the Bitnami chart; overrides are in `postgresql/override-values.yaml`.

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm upgrade --install pydbapi-db -n pydbapi \
  -f postgresql/override-values.yaml bitnami/postgresql \
  --version 16.5.6 --create-namespace

kubectl -n pydbapi exec -it pydbapi-db-postgresql-0 -- bash
# Inside pod: psql -h pydbapi-db-postgresql-0 -p 5432 -d postgres -U postgres
# postgres=# CREATE DATABASE pydbapi_db;
```

## 4. Install Redis

Redis is installed via the Bitnami chart; overrides are in `redis/override-values.yaml`.

```bash
helm upgrade --install redis -n pydbapi \
  -f redis/override-values.yaml bitnami/redis \
  --version 21.2.5 --create-namespace

kubectl -n pydbapi exec -it redis-master-0 -- redis-cli -h redis-master ping
```

## 5. Install pyDBAPI (app and prestart job)

Manifests in `pydbapi/`:

| File | Purpose |
|------|--------|
| `configmap.yaml` | Non-sensitive app config (domain, CORS, Redis host, script modules, flow control). |
| `secret.yaml` | Sensitive values (dev sample only; use `kubectl create secret` in production). |
| `job-prestart.yaml` | Job that runs migrations and seed before the app starts. |
| `deployment.yaml` | Main app (Nginx + FastAPI) with liveness/readiness probes. |
| `service.yaml` | ClusterIP service on port 80. |
| `ingress.yaml` | Routes host `pydbapi.local` to the app service. |

Apply in order:

```bash
kubectl apply -f pydbapi/configmap.yaml
kubectl apply -f pydbapi/secret.yaml
kubectl apply -f pydbapi/job-prestart.yaml
kubectl apply -f pydbapi/deployment.yaml
kubectl apply -f pydbapi/service.yaml
kubectl apply -f pydbapi/ingress.yaml  
```

Check resources:

```bash
kubectl -n pydbapi get pods,svc,ingress
```

## 6. Dev workflow (kind)

1. Create the kind cluster:
   ```bash
   kind create cluster --config k8s/kind.yaml
   ```

2. Install ingress-nginx, PostgreSQL, and Redis as above.

3. Apply pyDBAPI manifests:
   ```bash
   kubectl apply -f k8s/pydbapi/
   ```

4. Add the dev host to `/etc/hosts`:
   ```bash
   echo "127.0.0.1 pydbapi.local" | sudo tee -a /etc/hosts
   ```

5. Open the app:
   - Dashboard: `http://pydbapi.local`
   - API docs: `http://pydbapi.local/api/docs`

**Without Ingress:** use port-forward:

```bash
kubectl -n pydbapi port-forward svc/pydbapi 8080:80
```

Then open `http://localhost:8080`.
