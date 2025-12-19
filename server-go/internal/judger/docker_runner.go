// Package judger 提供代码评测功能
// 使用 Docker 容器来安全地运行和评测用户提交的代码
package judger

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// DockerRunner Docker 评测运行器
// 负责管理 Docker 容器来执行代码评测
type DockerRunner struct {
	imageName string         // Docker 镜像名称
	cli       *client.Client // Docker 客户端
}

// Options 评测选项配置
type Options struct {
	TimeLimitMs    int    // 时间限制（毫秒）
	MemoryLimitMB  int    // 内存限制（MB）
	CompileOptions string // 编译选项
}

// TestCase 测试用例
type TestCase struct {
	Input          string // 输入数据
	ExpectedOutput string // 期望输出
}

// CaseResult 单个测试用例的评测结果
type CaseResult struct {
	Status     string `json:"status"`     // 状态：Accepted, Wrong Answer, Time Limit Exceeded, Runtime Error
	TimeUsed   int    `json:"timeUsed"`   // 使用时间（毫秒）
	MemoryUsed int    `json:"memoryUsed"` // 使用内存（KB）
	Output     string `json:"output"`     // 实际输出
}

// JudgeResult 完整的评测结果
type JudgeResult struct {
	Status  string       `json:"status"`            // 整体状态
	Output  string       `json:"output,omitempty"`  // 输出信息（错误信息等）
	Results []CaseResult `json:"results,omitempty"` // 各测试用例结果
}

// execResult 命令执行结果（内部使用）
type execResult struct {
	ExitCode int    // 退出码
	Stdout   string // 标准输出
	Stderr   string // 标准错误
	TimedOut bool   // 是否超时
}

// containerConfig 容器配置（内部使用）
type containerConfig struct {
	memoryBytes int64  // 内存限制（字节）
	imageName   string // 镜像名称
}

// execAttachReader 执行附加读取器接口
type execAttachReader interface {
	io.Reader
}

// NewDockerRunner 创建新的 Docker 评测运行器
// imageName: Docker 镜像名称
// 返回: DockerRunner 实例和可能的错误
func NewDockerRunner(imageName string) (*DockerRunner, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	r := &DockerRunner{imageName: imageName, cli: cli}
	// 确保镜像存在
	_ = r.ensureImage(context.Background())
	return r, nil
}

// ensureImage 确保 Docker 镜像存在
// 如果镜像不存在，则尝试拉取
func (r *DockerRunner) ensureImage(ctx context.Context) error {
	// 检查镜像是否已存在
	_, _, err := r.cli.ImageInspectWithRaw(ctx, r.imageName)
	if err == nil {
		return nil
	}
	// 尝试拉取镜像
	rc, errPull := r.cli.ImagePull(ctx, r.imageName, image.PullOptions{})
	if errPull == nil {
		_, _ = io.Copy(io.Discard, rc)
		_ = rc.Close()
		return nil
	}
	return err
}

// Judge 执行代码评测
// 这是主要的评测入口函数，负责协调整个评测流程
func (r *DockerRunner) Judge(ctx context.Context, language string, code string, testCases []TestCase, opts Options) (JudgeResult, error) {
	// 验证语言参数
	if strings.TrimSpace(language) == "" {
		return JudgeResult{Status: "System Error", Output: "缺少语言参数"}, nil
	}

	// 创建并启动容器
	containerID, err := r.createAndStartContainer(ctx, opts)
	if err != nil {
		return JudgeResult{Status: "System Error", Output: err.Error()}, nil
	}
	// 确保容器在函数结束时被清理
	defer r.cleanupContainer(containerID)

	// 将代码写入容器
	if err := r.writeCodeToContainer(ctx, containerID, language, code); err != nil {
		return JudgeResult{Status: "System Error", Output: err.Error()}, nil
	}

	// 如果是 C++，需要先编译
	if language == "cpp" {
		if result, err := r.compileCode(ctx, containerID, opts); err != nil || result != nil {
			if err != nil {
				return JudgeResult{Status: "System Error", Output: err.Error()}, nil
			}
			return *result, nil
		}
	}

	// 运行所有测试用例
	results := r.runTestCases(ctx, containerID, language, testCases, opts)

	return JudgeResult{Status: "Judged", Results: results}, nil
}

// createAndStartContainer 创建并启动评测容器
func (r *DockerRunner) createAndStartContainer(ctx context.Context, opts Options) (string, error) {
	// 计算内存限制
	memoryBytes := int64(128 * 1024 * 1024) // 默认 128MB
	if opts.MemoryLimitMB > 0 {
		memoryBytes = int64(opts.MemoryLimitMB) * 1024 * 1024
	}

	// 创建容器
	created, err := r.cli.ContainerCreate(ctx, &container.Config{
		Image: r.imageName,
		Cmd:   []string{"/bin/bash", "-c", "sleep 300"},
		Tty:   false,
		User:  "runner",
	}, &container.HostConfig{
		Resources: container.Resources{
			Memory: memoryBytes,
		},
		NetworkMode: "none", // 禁用网络访问
	}, &network.NetworkingConfig{}, nil, "")
	if err != nil {
		return "", err
	}

	// 启动容器
	if err := r.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		return "", err
	}

	return created.ID, nil
}

// cleanupContainer 清理容器
func (r *DockerRunner) cleanupContainer(containerID string) {
	_ = r.cli.ContainerRemove(context.Background(), containerID, container.RemoveOptions{Force: true})
}

// writeCodeToContainer 将代码写入容器
func (r *DockerRunner) writeCodeToContainer(ctx context.Context, containerID string, language string, code string) error {
	// 根据语言确定文件名
	fileName := r.getSourceFileName(language)

	// 使用 base64 编码避免特殊字符问题
	codeB64 := base64.StdEncoding.EncodeToString([]byte(code))
	writeCmd := `echo "` + codeB64 + `" | base64 -d > ` + fileName

	writeRes, err := r.execCommand(ctx, containerID, []string{"/bin/bash", "-c", writeCmd}, 0)
	if err != nil {
		return err
	}
	if writeRes.ExitCode != 0 {
		return errors.New("写入代码到容器失败: " + writeRes.Stderr)
	}
	return nil
}

// getSourceFileName 根据语言获取源文件名
func (r *DockerRunner) getSourceFileName(language string) string {
	if language == "cpp" {
		return "main.cpp"
	}
	return "main.py"
}

// getRunCommand 根据语言获取运行命令
func (r *DockerRunner) getRunCommand(language string) string {
	if language == "cpp" {
		return "./main"
	}
	return "python3 main.py"
}

// compileCode 编译 C++ 代码
// 返回: 如果编译失败返回 JudgeResult，否则返回 nil
func (r *DockerRunner) compileCode(ctx context.Context, containerID string, opts Options) (*JudgeResult, error) {
	// 获取编译选项
	compileOpts := strings.TrimSpace(opts.CompileOptions)
	if compileOpts == "" {
		compileOpts = "-O2"
	}

	// 构建编译命令
	compileCmd := `g++ -std=c++23 ` + compileOpts + ` main.cpp -o main`

	compileRes, err := r.execCommand(ctx, containerID, []string{"/bin/bash", "-c", compileCmd}, 0)
	if err != nil {
		return nil, err
	}

	// 检查编译是否成功
	if compileRes.ExitCode != 0 {
		return &JudgeResult{
			Status: "Compilation Error",
			Output: compileRes.Stderr + compileRes.Stdout,
		}, nil
	}

	return nil, nil
}

// runTestCases 运行所有测试用例
func (r *DockerRunner) runTestCases(ctx context.Context, containerID string, language string, testCases []TestCase, opts Options) []CaseResult {
	results := make([]CaseResult, 0, len(testCases))
	runCmd := r.getRunCommand(language)

	for _, tc := range testCases {
		result := r.runSingleTestCase(ctx, containerID, runCmd, tc, opts)
		results = append(results, result)
	}

	return results
}

// runSingleTestCase 运行单个测试用例
func (r *DockerRunner) runSingleTestCase(ctx context.Context, containerID string, runCmd string, tc TestCase, opts Options) CaseResult {
	// 写入输入数据
	inputB64 := base64.StdEncoding.EncodeToString([]byte(tc.Input))
	_, _ = r.execCommand(ctx, containerID, []string{"/bin/bash", "-c", `echo "` + inputB64 + `" | base64 -d > input.txt`}, 0)

	// 构建带时间统计的运行命令
	timeCmd := `/usr/bin/time -f "%M %e"`
	runCmdWithTime := timeCmd + " " + runCmd + " < input.txt"

	// 执行并计时
	start := time.Now()
	runRes, err := r.execCommand(ctx, containerID, []string{"/bin/bash", "-c", runCmdWithTime}, opts.TimeLimitMs)
	elapsed := time.Since(start)

	if err != nil {
		return CaseResult{
			Status:   "System Error",
			TimeUsed: int(elapsed.Milliseconds()),
			Output:   err.Error(),
		}
	}

	// 解析并返回结果
	return r.parseTestCaseResult(runRes, tc, opts, int(elapsed.Milliseconds()))
}

// parseTestCaseResult 解析测试用例执行结果
func (r *DockerRunner) parseTestCaseResult(runRes execResult, tc TestCase, opts Options, timeUsed int) CaseResult {
	result := CaseResult{
		TimeUsed:   timeUsed,
		MemoryUsed: 0,
		Output:     strings.TrimSpace(runRes.Stdout),
	}

	// 检查是否超时
	if runRes.TimedOut {
		result.Status = "Time Limit Exceeded"
		if opts.TimeLimitMs > 0 {
			result.TimeUsed = opts.TimeLimitMs
		}
		return result
	}

	// 检查是否运行时错误
	if runRes.ExitCode != 0 {
		result.Status = "Runtime Error"
		result.Output = runRes.Stderr
		return result
	}

	// 解析内存使用量
	result.MemoryUsed = r.parseMemoryUsage(runRes.Stderr)

	// 比较输出结果
	if strings.TrimSpace(result.Output) != strings.TrimSpace(tc.ExpectedOutput) {
		result.Status = "Wrong Answer"
	} else {
		result.Status = "Accepted"
	}

	return result
}

// parseMemoryUsage 从 time 命令的输出中解析内存使用量
func (r *DockerRunner) parseMemoryUsage(stderr string) int {
	stderrLines := strings.Split(strings.TrimSpace(stderr), "\n")
	if len(stderrLines) > 0 {
		lastLine := strings.TrimSpace(stderrLines[len(stderrLines)-1])
		parts := strings.Fields(lastLine)
		if len(parts) >= 2 {
			if mem, err := parsePositiveInt(parts[0]); err == nil {
				return mem
			}
		}
	}
	return 0
}

// execCommand 在容器中执行命令
// timeoutMs: 超时时间（毫秒），0 表示不限制
func (r *DockerRunner) execCommand(ctx context.Context, containerID string, cmd []string, timeoutMs int) (execResult, error) {
	// 设置超时上下文
	execCtx := ctx
	var cancel context.CancelFunc
	if timeoutMs > 0 {
		execCtx, cancel = context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
		defer cancel()
	}

	// 创建执行实例
	created, err := r.cli.ContainerExecCreate(execCtx, containerID, container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
	})
	if err != nil {
		return r.handleExecError(err, containerID)
	}

	// 附加到执行实例
	attach, err := r.cli.ContainerExecAttach(execCtx, created.ID, container.ExecAttachOptions{})
	if err != nil {
		return r.handleExecError(err, containerID)
	}
	defer attach.Close()

	// 读取输出
	return r.readExecOutput(ctx, execCtx, containerID, created.ID, attach)
}

// handleExecError 处理执行错误
func (r *DockerRunner) handleExecError(err error, containerID string) (execResult, error) {
	if errors.Is(err, context.DeadlineExceeded) {
		_ = r.cli.ContainerStop(context.Background(), containerID, container.StopOptions{})
		return execResult{ExitCode: -1, TimedOut: true}, nil
	}
	return execResult{}, err
}

// readExecOutput 读取命令执行的输出
func (r *DockerRunner) readExecOutput(ctx context.Context, execCtx context.Context, containerID string, execID string, attach types.HijackedResponse) (execResult, error) {
	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer

	// 异步复制输出
	copyDone := make(chan error, 1)
	go func() {
		_, err := stdcopy.StdCopy(&stdoutBuf, &stderrBuf, attach.Reader)
		if err != nil && !errors.Is(err, io.EOF) {
			copyDone <- err
			return
		}
		copyDone <- nil
	}()

	// 等待完成或超时
	select {
	case err := <-copyDone:
		if err != nil {
			return execResult{}, err
		}
	case <-execCtx.Done():
		// 超时，停止容器
		_ = r.cli.ContainerStop(context.Background(), containerID, container.StopOptions{})
		return execResult{
			ExitCode: -1,
			Stdout:   stdoutBuf.String(),
			Stderr:   stderrBuf.String(),
			TimedOut: true,
		}, nil
	}

	// 获取退出码
	inspect, err := r.cli.ContainerExecInspect(ctx, execID)
	if err != nil {
		return execResult{
			ExitCode: -1,
			Stdout:   stdoutBuf.String(),
			Stderr:   stderrBuf.String(),
			TimedOut: true,
		}, nil
	}

	return execResult{
		ExitCode: inspect.ExitCode,
		Stdout:   stdoutBuf.String(),
		Stderr:   stderrBuf.String(),
		TimedOut: false,
	}, nil
}

// parsePositiveInt 解析正整数
func parsePositiveInt(s string) (int, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, errors.New("空字符串")
	}
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, errors.New("无效数字")
		}
		n = n*10 + int(r-'0')
	}
	return n, nil
}
