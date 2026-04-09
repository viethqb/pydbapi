{{/*
Expand the name of the chart.
*/}}
{{- define "pydbapi.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "pydbapi.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "pydbapi.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "pydbapi.labels" -}}
helm.sh/chart: {{ include "pydbapi.chart" . }}
{{ include "pydbapi.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "pydbapi.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pydbapi.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ConfigMap name
*/}}
{{- define "pydbapi.configMapName" -}}
{{ include "pydbapi.fullname" . }}-config
{{- end }}

{{/*
Secret name
*/}}
{{- define "pydbapi.secretName" -}}
{{ include "pydbapi.fullname" . }}-secrets
{{- end }}

{{/*
ServiceAccount name
*/}}
{{- define "pydbapi.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "pydbapi.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
