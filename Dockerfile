# 1. 基镜像：选择一个轻量级的 Python 3.11 镜像
FROM python:3.11-slim

# 2. 设置工作目录：在容器内创建一个名为 /app 的目录
WORKDIR /app

# 3. 拷贝文件：将本地的 backend 目录下的所有内容拷贝到容器的 /app 目录
COPY ./backend/ .

# 4. 安装依赖：读取 requirements.txt 文件并安装所有必要的库
# --no-cache-dir 选项可以减小镜像体积
RUN pip install --no-cache-dir -r requirements.txt

# 5. 暴露端口：声明容器将监听 8000 端口
EXPOSE 8000

# 6. 启动命令：当容器启动时，执行此命令来运行 FastAPI 应用
#    --host 0.0.0.0 让应用可以从外部访问
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"] 