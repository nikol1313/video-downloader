import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    filename = 'app.log',
    filemode = 'a'
)

def get_logger(name: str):
    return logging.getLogger(name)