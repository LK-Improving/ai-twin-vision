#!/usr/bin/env bash
#
# D 组 D2：一键演示脚本 —— 一条命令跑通主链路
#
# 顺序：起 MQTT Broker → 构建契约 → 起后端 → 健康检查 → 起前端 → 起 IoT 模拟器
# 退出的同时自动清理所有子进程（Ctrl-C 或脚本结束均会优雅关停）。
#
# 前置条件（本机已装的服务，脚本不负责启停）：
#   - PostgreSQL  localhost:5432  (库 digital_twin，已 schema:init + seed)
#   - Redis       localhost:6379
#   - Docker      （仅用于起 Mosquitto broker；若本机已有 1883 上的 broker 可跳过）
#
# 用法：
#   ./demo.sh                 # 默认后端端口 3001
#   BACKEND_PORT=8081 ./demo.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${BACKEND_PORT:-3001}"
HEALTH_URL="http://localhost:${BACKEND_PORT}/api/v1/health"

# 子进程 PID 收集，退出时统一清理
PIDS=()
cleanup() {
  echo ""
  echo "==> 正在停止演示进程..."
  for pid in "${PIDS[@]}"; do
    # 先杀直接子进程（pnpm 拉起的 nest / vite / node），再杀 pnpm 自身
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "==> 演示已停止。"
}
trap cleanup EXIT INT TERM

log() { echo -e "\033[1;36m$*\033[0m"; }

log "==> [1/5] 启动 MQTT Broker (Mosquitto)..."
docker compose -f docker/docker-compose.dev.yml --env-file .env.dev --profile iot up -d mosquitto \
  || { echo "⚠️  Mosquitto 启动失败（Docker 不可用？若 1883 上已有 broker 可忽略）"; }

log "==> [2/5] 构建共享类型契约 (@dt/shared-types)..."
pnpm --filter @dt/shared-types build

log "==> [3/5] 启动后端 (port ${BACKEND_PORT})..."
pnpm --filter @dt/widget-server start:dev > /tmp/dt-backend.log 2>&1 &
PIDS+=($!)

log "    等待后端健康检查 ${HEALTH_URL} ..."
ready=0
for i in $(seq 1 40); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -eq 1 ]; then
  log "    后端就绪 ✓"
else
  echo "⚠️  后端 40s 内未通过健康检查，请查看 /tmp/dt-backend.log（多半是 PostgreSQL/Redis 未就绪）"
fi

log "==> [4/5] 启动前端 (vite dev)..."
pnpm --filter @dt/builder dev > /tmp/dt-frontend.log 2>&1 &
FRONTEND_PID=$!
PIDS+=($FRONTEND_PID)

# vite 自动探测端口，8000 被占会跳到 8001/8002… 这里从日志里抓真实地址
log "    等待 vite 打印实际监听地址..."
FRONTEND_URL=""
for i in $(seq 1 25); do
  FRONTEND_URL=$(sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' /tmp/dt-frontend.log | grep -oE 'http://localhost:[0-9]+' | head -1)
  if [ -n "$FRONTEND_URL" ]; then
    break
  fi
  # 前端进程如果已经挂了，立刻停下排查
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "⚠️  前端进程异常退出，请查看 /tmp/dt-frontend.log"
    break
  fi
  sleep 1
done
[ -z "$FRONTEND_URL" ] && FRONTEND_URL="http://localhost:8000"

log "==> [5/5] 启动 IoT 模拟器（每 2s 推送 TRANS-001 遥测）..."
MQTT_BROKER="${MQTT_BROKER:-mqtt://localhost:1883}" \
SIM_DEVICES="${SIM_DEVICES:-TRANS-001}" \
SIM_INTERVAL_MS="${SIM_INTERVAL_MS:-2000}" \
  pnpm --filter @dt/widget-server exec node ../../../docker/iot-simulator.mjs > /tmp/dt-simulator.log 2>&1 &
PIDS+=($!)

echo ""
log "🎉 演示链路已启动："
echo "   - 后端 API/WS : http://localhost:${BACKEND_PORT}"
echo "   - 前端构建器   : ${FRONTEND_URL}"
echo "   - 模拟器日志   : /tmp/dt-simulator.log"
echo "   - 后端日志     : /tmp/dt-backend.log"
echo "   - 前端日志     : /tmp/dt-frontend.log"
echo ""
echo "   演示步骤：登录 admin/Admin@123 → 打开已发布大屏 /screen/:token → 看数据跳动、温度越阈变红。"
echo "   按 Ctrl-C 停止全部。"
echo ""

# 持续占用前台，保证后台进程随脚本存活；任一子进程异常退出也继续等待直到用户中断
wait
