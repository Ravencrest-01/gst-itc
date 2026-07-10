from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
try:
    hash = pwd_context.hash("Ritik@212")
    print(hash)
except Exception as e:
    print(e)
