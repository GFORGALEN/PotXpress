import crypto from 'node:crypto';

// 当前服务进程的唯一标识。用于跨实例实时广播时识别"自己发出的通知"。
export const INSTANCE_ID = crypto.randomUUID();
