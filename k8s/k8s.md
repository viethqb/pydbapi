# PYDBAPI K8S EXAMPLE

## CREATE K8S CLUSTER USING KIND

```bash
❯ kind create cluster --config kind.yaml
❯ kubectl get no -owide
```

## INSTALL NGINX INGRESS CONTROLLER

```bash
❯ helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
❯ helm repo update
❯ helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx --set controller.hostNetwork=true,controller.service.type="",controller.kind=DaemonSet --namespace ingress-nginx --version 4.10.1 --create-namespace --debug --timeout 600s

❯ kubectl -n ingress-nginx get po -owide
```

## INSTALL POSTGRESQL

```bash
❯ helm repo add bitnami https://charts.bitnami.com/bitnami
❯ helm repo update
❯ helm upgrade --install pydbapi-db -n pydbapi -f postgresql/override-values.yaml bitnami/postgresql --version 16.5.6 --create-namespace --debug

❯ kubectl -n pydbapi exec -it pydbapi-db-postgresql-0 -- bash
❯ I have no name!@dataplatform-db-postgresql-0:/$ psql -h pydbapi-db-postgresql-0 -p 5432 -d postgres -U postgres
❯ postgres=# CREATE DATABASE pydbapi_db;
```

## INSTALL REDIS

```bash
❯ helm upgrade --install redis -n pydbapi -f redis/override-values.yaml bitnami/redis --version 21.2.5 --create-namespace --debug
❯ kubectl -n pydbapi exec -it redis-master-0 -- bash
❯ redis-cli -h redis-master
```

## INSTALL PYDBAPI

```bash
kubectl apply -f pydbapi/configmap.yaml
kubectl apply -f pydbapi/secret.yaml
kubectl apply -f pydbapi/job-prestart.yaml
kubectl apply -f pydbapi/deployment.yaml
kubectl apply -f pydbapi/service.yaml
kubectl apply -f pydbapi/ingress.yaml  # Nếu cần
```

