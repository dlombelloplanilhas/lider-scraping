import requests

from typing import Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()


class LoginCredentials(BaseModel):
    username: str
    password: str


class ScrapingResponse(BaseModel):
    success: bool
    data: Any
    message: str = ""


@app.get("/")
def read_root(name: str = "World"):
    return {"message": f"Hello {name}"}


@app.post("/scrape-data", response_model=ScrapingResponse)
async def scrape_data(credentials: LoginCredentials):
    session = requests.Session()
    s = session.post(
        "https://sol.lideraviacao.com.br/Login",
        headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        data={"ReturnUrl": "", "User": credentials.username, "Password": credentials.password})
    res = session.post('https://sol.lideraviacao.com.br/AcompanhamentoCliente/AcompanhamentoCliente/GetAllByFilter')
    return ScrapingResponse(success=True, data=res.json()['DadosAdicionais']['Lista'], message="Data scraped successfully")


@app.get("/scrape-data", response_model=ScrapingResponse)
async def scrape_data(username=str, password=str):
    try:
        session = requests.Session()

        # Primeiro POST: Login (aqui a requisição interna ainda é POST)
        login_response = session.post(
            "https://sol.lideraviacao.com.br/Login",
            headers={
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data={"ReturnUrl": "", "User": username, "Password": password} # Usamos username e password diretamente aqui
        )
        login_response.raise_for_status() # Lança um erro para status de erro (4xx ou 5xx)

        # Segundo POST: Obter dados após o login
        data_response = session.post('https://sol.lideraviacao.com.br/AcompanhamentoCliente/AcompanhamentoCliente/GetAllByFilter')
        data_response.raise_for_status() # Lança um erro para status de erro

        # Verificar se a resposta tem a estrutura esperada antes de acessar
        response_json = data_response.json()
        if 'DadosAdicionais' in response_json and 'Lista' in response_json['DadosAdicionais']:
            scraped_data = response_json['DadosAdicionais']['Lista']
            return ScrapingResponse(success=True, data=scraped_data, message="Data scraped successfully")
        else:
            raise HTTPException(status_code=500, detail="Unexpected data structure from external API.")

    except requests.exceptions.RequestException as e:
        # Lidar com erros de requisição (rede, timeout, etc.)
        raise HTTPException(status_code=500, detail=f"Error communicating with external API: {e}")
    except ValueError:
        # Lidar com erros de JSON (se a resposta não for JSON válida)
        raise HTTPException(status_code=500, detail="Invalid JSON response from external API.")
    except Exception as e:
        # Lidar com outros erros inesperados
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")