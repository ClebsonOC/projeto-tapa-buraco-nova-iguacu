document.addEventListener('DOMContentLoaded', function() {
    carregarDados();

    const filtroRua = document.getElementById('filtro-rua');
    if(filtroRua) filtroRua.addEventListener('keyup', () => carregarDados());
});

function carregarDados() {
    const loadingDiv = document.getElementById('loading');
    const tableBody = document.getElementById('report-table-body');
    const loggedInUser = localStorage.getItem('loggedInUser');
    const rua = document.getElementById('filtro-rua').value;

    if (!loggedInUser) {
        loadingDiv.innerText = 'Usuário não identificado.';
        return;
    }
    
    loadingDiv.style.display = 'block';
    tableBody.innerHTML = '';
    
    let apiUrl = `/api/buracos?usuario=${loggedInUser}`;
    if (rua) apiUrl += `&rua=${rua}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if(data.error) {
                loadingDiv.innerHTML = `<span style="color: red;">${data.error}</span>`;
                return;
            }
            loadingDiv.style.display = 'none';
            const groupedBySubmission = data.reduce((acc, item) => {
                const id = item.submissionId;
                if (!acc[id]) acc[id] = [];
                acc[id].push(item);
                return acc;
            }, {});

            if (Object.keys(groupedBySubmission).length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
                return;
            }
            
            for (const submissionId in groupedBySubmission) {
                const group = groupedBySubmission[submissionId];
                const firstItem = group[0];
                const dataFormatada = new Date(firstItem.registradoEm._seconds * 1000).toLocaleString('pt-BR');
                
                const mainRow = document.createElement('tr');
                mainRow.innerHTML = `
                    <td><button class="expand-btn" onclick="toggleDetails(this, 'details-${submissionId}')">+</button></td>
                    <td>${dataFormatada}</td>
                    <td>${firstItem.rua}</td>
                    <td>${firstItem.bairro}</td>
                    <td>${firstItem.registradoPor}</td>
                    <td class="actions">
                        <button class="btn-delete" onclick="deletarVisita('${submissionId}')">Deletar Visita</button>
                    </td>
                `;
                tableBody.appendChild(mainRow);
                
                const detailsRow = document.createElement('tr');
                detailsRow.id = `details-${submissionId}`;
                detailsRow.className = 'details-row';
                
                let detailsHtml = '';
                group.sort((a,b) => (a.identificadorBuraco > b.identificadorBuraco) ? 1 : -1)
                     .forEach(buraco => {
                    const dim = buraco.dimensoes;
                    detailsHtml += `
                        <p style="display:flex; justify-content:space-between; align-items:center;">
                            <span><strong>${buraco.identificadorBuraco}:</strong> L: ${dim.largura}m, C: ${dim.comprimento}m, E: ${dim.espessura}cm</span>
                            <button class="btn-update" style="padding: 4px 8px; font-size: 0.8em;" onclick="editarBuraco('${buraco.id}', '${dim.largura}', '${dim.comprimento}', '${dim.espessura}')">Editar</button>
                        </p>
                    `;
                });

                const linksHtml = (firstItem.fotosDriveLinks || []).map(link => `<a href="${link}" target="_blank">${link}</a>`).join('<br>') || 'Nenhuma foto.';
                detailsRow.innerHTML = `
                    <td colspan="6">
                        <div class="details-content">
                            <h4>Detalhes dos Buracos</h4>
                            ${detailsHtml}
                            <hr style="border:0; border-top:1px solid #ddd; margin:15px 0;">
                            <p><strong>Condição do Tempo:</strong> ${firstItem.condicaoTempo}</p>
                            <p><strong>Links das Fotos:</strong><br>${linksHtml}</p>
                        </div>
                    </td>
                `;
                tableBody.appendChild(detailsRow);
            }
        });
}

function toggleDetails(button, detailsId) {
    const detailsRow = document.getElementById(detailsId);
    if (detailsRow) {
        detailsRow.classList.toggle('show');
        button.textContent = detailsRow.classList.contains('show') ? '−' : '+';
    }
}

function deletarVisita(submissionId) {
    if (!confirm('Tem certeza que deseja deletar TODA esta visita e seus registros?')) return;
    fetch(`/api/buracos/submission/${submissionId}`, { method: 'DELETE' })
    .then(res => res.json()).then(data => { alert(data.message || data.error); carregarDados(); });
}

function editarBuraco(docId, larguraAtual, comprimentoAtual, espessuraAtual) {
    const novaLargura = prompt("Nova Largura (m):", larguraAtual);
    const novoComprimento = prompt("Novo Comprimento (m):", comprimentoAtual);
    const novaEspessura = prompt("Nova Espessura (cm):", espessuraAtual);
    if (novaLargura === null || novoComprimento === null || novaEspessura === null) return;
    const novasDimensoes = {
        largura: novaLargura.trim().replace('.',','),
        comprimento: novoComprimento.trim().replace('.',','),
        espessura: novaEspessura.trim().replace('.',',')
    };
    fetch(`/api/buracos/dimensoes/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensoes: novasDimensoes })
    })
    .then(res => res.json()).then(data => { alert(data.message || data.error); carregarDados(); });
}