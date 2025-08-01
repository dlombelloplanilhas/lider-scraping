import requests
from fastapi import FastAPI, HTTPException
app = FastAPI()

@app.get("/")
def read_root(name: str = "World"):
    return {"message": f"Hello {name}"}

@app.post("/scrape-data")
async def scrape_data(username, password):
    session = requests.Session()
    try:
        # Realiza o login
        s = session.post(
            "https://sol.lideraviacao.com.br/Login",
            headers={
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data={"ReturnUrl": "", "User": username, "Password": password}
        )
        s.raise_for_status()  # Levanta um erro para códigos de status HTTP 4xx/5xx

        # Verifica se o login foi bem-sucedido (você pode precisar de uma verificação mais robusta aqui)
        # Por exemplo, verificar se a URL mudou ou se há um token de sessão
        if "Login" in s.url: # Exemplo simples, pode não ser suficiente para todos os casos
            raise HTTPException(status_code=401, detail="Credenciais de login inválidas.")

        # Realiza a requisição para obter os dados após o login
        res = session.post('https://sol.lideraviacao.com.br/AcompanhamentoCliente/AcompanhamentoCliente/GetAllByFilter')
        res.raise_for_status() # Levanta um erro para códigos de status HTTP 4xx/5xx

        # Retorna os dados
        return {'success': True, 'data': res.json()['DadosAdicionais']['Lista'], 'message': "Data scraped successfully"}

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Erro na requisição: {e}")
    except KeyError:
        raise HTTPException(status_code=500, detail="Estrutura de resposta inesperada da API.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro inesperado: {e}")

@app.get("/scrape-data")
async def scrape_data(username, password):
    try:
        session = requests.Session()

        # Primeiro POST: Login
        login_response = session.post(
            "https://sol.lideraviacao.com.br/Login",
            headers={
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data={"ReturnUrl": "", "User": username, "Password": password}
        )
        login_response.raise_for_status()

        # Segundo POST: Obter dados após o login
        data_response = session.post('https://sol.lideraviacao.com.br/AcompanhamentoCliente/AcompanhamentoCliente/GetAllByFilter')
        data_response.raise_for_status()

        # Verificar se a resposta tem a estrutura esperada antes de acessar
        response_json = data_response.json()
        if 'DadosAdicionais' in response_json and 'Lista' in response_json['DadosAdicionais']:
            scraped_data = response_json['DadosAdicionais']['Lista']
            return {"success": True, "data": scraped_data, "message": "Data scraped successfully"}
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
