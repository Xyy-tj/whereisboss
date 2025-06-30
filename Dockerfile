# 1. 基镜像：选择一个轻量级的 Python 3.11 镜像
FROM python:3.11-slim

# 2. 设置工作目录
WORKDIR /app

# 3. 声明数据卷挂载点
VOLUME ["/app/database.db"]

# 4. 拷贝文件
COPY ./backend/ .

# 5. 安装依赖（使用清华源加速）
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# 6. 暴露端口
EXPOSE 8000

# 7. 启动命令
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
