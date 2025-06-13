// public/js/efetivo.js

// Lista de itens atualizada conforme sua solicitação
const ITENS_EFETIVO = [
    "CAMINHÃO CACHORREIRA", "CAMINHÃO CAÇAMBA", "ROLO DE CHAPA", "CORTADORA DE PISO",
    "OPERADOR ROLO", "MOTORISTA 1", "MOTORISTA 2", "ENCARREGADO", "APONTADOR",
    "AJUDANTE 1", "AJUDANTE 2", "AJUDANTE 3", "AJUDANTE 4", "AJUDANTE 5",
    "RASTELEIRO 1", "RASTELEIRO 2"
];

let efetivoDeHojeId = null;

document.addEventListener('DOMContentLoaded', function() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser) {
        window.location.href = '/login.html';
        return;
    }

    initializeForm();
    carregarEfetivoDeHoje(loggedInUser);
    carregarHistorico(loggedInUser);

    const form = document.getElementById('efetivo-form');
    if (form) {
        form.addEventListener('submit', salvarEfetivo);
    }
});

function initializeForm() {
    document.getElementById('data-hoje').textContent = `Registro para: ${new Date().toLocaleDateString('pt-BR')}`;
    const gridContainer = document.querySelector('.efetivo-grid');
    gridContainer.innerHTML = '';
    ITENS_EFETIVO.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'item-group';
        const itemId = `check-${item.replace(/ /g, '-')}`;
        itemDiv.innerHTML = `<input type="checkbox" id="${itemId}" name="item" value="${item}"><label for="${itemId}">${item}</label>`;
        gridContainer.appendChild(itemDiv);
    });
}

async function carregarEfetivoDeHoje(usuario) {
    try {
        const response = await fetch(`/api/efetivo?usuario=${usuario}`);
        if (!response.ok) throw new Error('Falha ao buscar dados.');
        const historico = await response.json();
        const hojeISO = new Date().toISOString().split('T')[0];
        const registroDeHoje = historico.find(reg => reg.registradoEm && new Date(reg.registradoEm._seconds * 1000).toISOString().startsWith(hojeISO));

        if (registroDeHoje) {
            efetivoDeHojeId = registroDeHoje.id;
            document.getElementById('salvar-btn').textContent = "Atualizar Efetivo";
            document.getElementById('observacao').value = registroDeHoje.observacao;
            ITENS_EFETIVO.forEach(item => {
                const checkbox = document.querySelector(`input[value="${item}"]`);
                if (checkbox) {
                    checkbox.checked = registroDeHoje.itensPresentes.includes(item);
                }
            });
        }
    } catch (error) {
        console.error("Erro ao carregar efetivo de hoje:", error);
    }
}

async function carregarHistorico(usuario) {
    const loadingDiv = document.getElementById('loading-historico');
    const tableBody = document.getElementById('historico-table-body');
    loadingDiv.style.display = 'block';
    tableBody.innerHTML = '';

    try {
        const response = await fetch(`/api/efetivo?usuario=${usuario}`);
        const historico = await response.json();
        loadingDiv.style.display = 'none';

        if (historico.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum histórico encontrado.</td></tr>';
            return;
        }

        historico.forEach(registro => {
            const dataFormatada = new Date(registro.registradoEm._seconds * 1000).toLocaleDateString('pt-BR');
            const resumoItens = `${registro.itensPresentes.length} de ${ITENS_EFETIVO.length} itens presentes`;
            const docId = registro.id;

            const mainRow = document.createElement('tr');
            mainRow.innerHTML = `
                <td><button class="expand-btn" onclick="toggleDetails(this, 'details-${docId}')">+</button></td>
                <td>${dataFormatada}</td>
                <td>${resumoItens}</td>
            `;
            tableBody.appendChild(mainRow);

            const detailsRow = document.createElement('tr');
            detailsRow.id = `details-${docId}`;
            detailsRow.className = 'details-row';
            const itensHtml = registro.itensPresentes.length > 0 ? `<li>${registro.itensPresentes.join('</li><li>')}</li>` : '<li>Nenhum item marcado como presente.</li>';

            detailsRow.innerHTML = `
                <td colspan="3">
                    <div class="details-content">
                        <p><strong>Itens Presentes:</strong></p>
                        <ul>${itensHtml}</ul>
                        <p><strong>Observação:</strong></p>
                        <p>${registro.observacao || 'Nenhuma observação foi feita.'}</p>
                    </div>
                </td>
            `;
            tableBody.appendChild(detailsRow);
        });
    } catch (error) {
        loadingDiv.innerText = 'Erro ao carregar histórico.';
    }
}

function toggleDetails(button, detailsId) {
    const detailsRow = document.getElementById(detailsId);
    if (detailsRow) {
        detailsRow.classList.toggle('show');
        button.textContent = detailsRow.classList.contains('show') ? '−' : '+';
    }
}

async function salvarEfetivo(event) {
    event.preventDefault();
    const salvarBtn = document.getElementById('salvar-btn');
    salvarBtn.disabled = true;
    salvarBtn.textContent = 'Salvando...';
    
    const itensPresentes = Array.from(document.querySelectorAll('input[name="item"]:checked')).map(cb => cb.value);
    const observacao = document.getElementById('observacao').value;

    const payload = {
        registradoPor: localStorage.getItem('loggedInUser'),
        itensPresentes,
        observacao
    };

    let url = '/api/efetivo';
    let method = 'POST';
    if (efetivoDeHojeId) {
        url = `/api/efetivo/${efetivoDeHojeId}`;
        method = 'PATCH';
    }
    
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        
        // Lógica de sucesso com o popup
        const successOverlay = document.getElementById('success-overlay');
        successOverlay.classList.add('active');

        // Após 2 segundos, recarrega a página para resetar e atualizar o histórico
        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        alert(`Erro: ${error.message}`);
        salvarBtn.disabled = false;
        salvarBtn.textContent = efetivoDeHojeId ? 'Atualizar Efetivo' : 'Salvar Efetivo de Hoje';
    }
}