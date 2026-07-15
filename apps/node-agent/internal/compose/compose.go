package compose

import (
	"fmt"
	"os"

	protocol "github.com/benisploy/agent-protocol/go"
	"gopkg.in/yaml.v3"
)

type composeFile struct {
	Version  string                    `yaml:"version,omitempty"`
	Services map[string]composeService `yaml:"services"`
}

type composeService struct {
	Image         string              `yaml:"image,omitempty"`
	ContainerName string              `yaml:"container_name,omitempty"`
	Environment   map[string]string   `yaml:"environment,omitempty"`
	Ports         []string            `yaml:"ports,omitempty"`
	Volumes       []string            `yaml:"volumes,omitempty"`
	Deploy        *composeDeploy      `yaml:"deploy,omitempty"`
	Healthcheck   *composeHealthcheck `yaml:"healthcheck,omitempty"`
}

type composeDeploy struct {
	Resources *composeResources `yaml:"resources,omitempty"`
}

type composeResources struct {
	Limits *composeResourceLimit `yaml:"limits,omitempty"`
}

type composeResourceLimit struct {
	CPUs   string `yaml:"cpus,omitempty"`
	Memory string `yaml:"memory,omitempty"`
}

type composeHealthcheck struct {
	Test        []string `yaml:"test"`
	Interval    string   `yaml:"interval,omitempty"`
	Timeout     string   `yaml:"timeout,omitempty"`
	Retries     int      `yaml:"retries,omitempty"`
	StartPeriod string   `yaml:"start_period,omitempty"`
}

func (m *Manager) GenerateComposeFile(deploymentID string, spec *protocol.AppSpec, composeContent string) (string, error) {
	if err := m.ensureDir(deploymentID); err != nil {
		return "", fmt.Errorf("create project dir: %w", err)
	}

	var raw string
	if composeContent != "" {
		raw = composeContent
	} else {
		gen, err := m.buildComposeYAML(spec)
		if err != nil {
			return "", fmt.Errorf("build compose yaml: %w", err)
		}

		if spec.ComposeOverrides != "" {
			merged, err := mergeYAML(gen, spec.ComposeOverrides)
			if err != nil {
				return "", fmt.Errorf("merge compose overrides: %w", err)
			}
			gen = merged
		}

		raw = gen
	}

	path := m.composePath(deploymentID)
	if err := os.WriteFile(path, []byte(raw), 0644); err != nil {
		return "", fmt.Errorf("write compose file: %w", err)
	}

	return path, nil
}

func (m *Manager) buildComposeYAML(spec *protocol.AppSpec) (string, error) {
	svc := composeService{
		ContainerName: sanitize(spec.Name),
		Environment:   spec.EnvVars,
	}

	if spec.Image != "" {
		svc.Image = spec.Image
	}

	for _, p := range spec.Ports {
		svc.Ports = append(svc.Ports, portString(p.Container, p.Protocol))
	}

	for _, v := range spec.VolumeMounts {
		svc.Volumes = append(svc.Volumes, volumeString(v.Source, v.Target, v.Mode))
	}

	if spec.ResourceLimits != nil {
		svc.Deploy = &composeDeploy{
			Resources: &composeResources{
				Limits: &composeResourceLimit{
					CPUs:   spec.ResourceLimits.CPUs,
					Memory: fmt.Sprintf("%dM", spec.ResourceLimits.MemoryMB),
				},
			},
		}
	}

	if spec.HealthCheck != nil {
		svc.Healthcheck = &composeHealthcheck{
			Test:        spec.HealthCheck.Test,
			Interval:    durationString(spec.HealthCheck.Interval),
			Timeout:     durationString(spec.HealthCheck.Timeout),
			Retries:     spec.HealthCheck.Retries,
			StartPeriod: durationString(spec.HealthCheck.StartPeriod),
		}
	}

	cf := composeFile{
		Services: map[string]composeService{spec.Name: svc},
	}

	out, err := yaml.Marshal(cf)
	if err != nil {
		return "", fmt.Errorf("marshal compose yaml: %w", err)
	}

	return string(out), nil
}

func sanitize(name string) string {
	out := make([]byte, 0, len(name))
	for _, c := range []byte(name) {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' {
			out = append(out, c)
		} else {
			out = append(out, '-')
		}
	}
	return string(out)
}

func portString(container int, protocol string) string {
	if protocol == "udp" {
		return fmt.Sprintf("%d/udp", container)
	}
	return fmt.Sprintf("%d", container)
}

func volumeString(source, target, mode string) string {
	if mode == "" || mode == "rw" {
		return fmt.Sprintf("%s:%s", source, target)
	}
	return fmt.Sprintf("%s:%s:%s", source, target, mode)
}

func durationString(seconds int) string {
	return fmt.Sprintf("%ds", seconds)
}

func mergeYAML(base, overlay string) (string, error) {
	var baseMap map[string]any
	if err := yaml.Unmarshal([]byte(base), &baseMap); err != nil {
		return "", fmt.Errorf("unmarshal base: %w", err)
	}

	var overlayMap map[string]any
	if err := yaml.Unmarshal([]byte(overlay), &overlayMap); err != nil {
		return "", fmt.Errorf("unmarshal overlay: %w", err)
	}

	deepMerge(baseMap, overlayMap)

	out, err := yaml.Marshal(baseMap)
	if err != nil {
		return "", fmt.Errorf("marshal merged: %w", err)
	}
	return string(out), nil
}

func deepMerge(dst, src map[string]any) {
	for k, srcVal := range src {
		srcMap, srcIsMap := srcVal.(map[string]any)
		dstMap, dstIsMap := dst[k].(map[string]any)

		if srcIsMap && dstIsMap {
			deepMerge(dstMap, srcMap)
		} else {
			dst[k] = srcVal
		}
	}
}
