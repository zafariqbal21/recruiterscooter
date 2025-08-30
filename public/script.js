
document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadResults = document.getElementById('uploadResults');
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    let currentData = null;
    let charts = {};

    // Tab Navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update active tab pane
            tabPanes.forEach(pane => pane.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');
            
            // Render charts for the active tab
            if (currentData) {
                renderChartsForTab(targetTab);
            }
        });
    });

    // File Upload Handler
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        const fileInput = document.getElementById('recruitmentData');
        
        if (!fileInput.files[0]) {
            alert('Please select a file');
            return;
        }

        formData.append('recruitmentData', fileInput.files[0]);
        
        showLoadingSpinner(true);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                currentData = result;
                displayResults(result);
                updateMetrics(result.summary);
                populateDataTable(result.data);
                renderChartsForTab('overview');
            } else {
                displayError(result.error);
            }
        } catch (error) {
            displayError('Upload failed: ' + error.message);
        } finally {
            showLoadingSpinner(false);
        }
    });

    function showLoadingSpinner(show) {
        loadingSpinner.style.display = show ? 'flex' : 'none';
    }

    function displayResults(result) {
        uploadResults.className = '';
        uploadResults.innerHTML = `
            <h3>✅ Upload Successful!</h3>
            <p><strong>File:</strong> ${result.filename}</p>
            <p><strong>Records processed:</strong> ${result.summary?.totalRecords || result.rowCount}</p>
            <p><strong>Processed at:</strong> ${new Date(result.processedAt || Date.now()).toLocaleString()}</p>
        `;
        uploadStatus.style.display = 'block';
    }

    function displayError(error) {
        uploadResults.className = 'error';
        uploadResults.innerHTML = `
            <h3>❌ Upload Failed</h3>
            <p>${error}</p>
        `;
        uploadStatus.style.display = 'block';
    }

    function updateMetrics(summary) {
        if (!summary) return;
        
        document.getElementById('totalRecords').textContent = summary.totalRecords || 0;
        document.getElementById('totalPositions').textContent = summary.totalPositions || 0;
        document.getElementById('totalCVs').textContent = summary.totalCVs || 0;
        document.getElementById('activeRecruiters').textContent = summary.uniqueRecruiters || 0;
        document.getElementById('activeClients').textContent = summary.uniqueClients || 0;
        document.getElementById('positionsOnHold').textContent = summary.positionsOnHold || 0;
    }

    function populateDataTable(data) {
        const tableBody = document.getElementById('dataTableBody');
        
        if (!data || data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" class="no-data">No data available</td></tr>';
            return;
        }

        tableBody.innerHTML = data.map(record => `
            <tr>
                <td>${record.recruiter || '-'}</td>
                <td>${record.bdm || '-'}</td>
                <td>${record.clientName || '-'}</td>
                <td>${record.positionName || '-'}</td>
                <td>${record.noOfPosition || '-'}</td>
                <td>${record.requisitionLoggedDate || '-'}</td>
                <td>${record.numberOfCVs || '-'}</td>
                <td>${record.positionOnHoldDate || '-'}</td>
                <td>${record.days || '-'}</td>
                <td>${record.remarks || '-'}</td>
            </tr>
        `).join('');
    }

    function renderChartsForTab(tabName) {
        if (!currentData || !currentData.data) return;

        switch (tabName) {
            case 'positions':
                renderPositionCharts();
                break;
            case 'recruiters':
                renderRecruiterCharts();
                break;
            case 'clients':
                renderClientCharts();
                break;
            case 'timeline':
                renderTimelineCharts();
                break;
        }
    }

    function renderPositionCharts() {
        // Position Status Chart
        const statusData = getPositionStatusData();
        renderChart('positionStatusChart', {
            type: 'doughnut',
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.values,
                    backgroundColor: ['#4299e1', '#ed8936', '#48bb78', '#f56565']
                }]
            },
            options: getChartOptions('Position Status Distribution')
        });

        // Positions by Client Chart
        const clientData = getPositionsByClientData();
        renderChart('positionsByClientChart', {
            type: 'bar',
            data: {
                labels: clientData.labels,
                datasets: [{
                    label: 'Positions',
                    data: clientData.values,
                    backgroundColor: '#4299e1'
                }]
            },
            options: getChartOptions('Positions by Client', true)
        });
    }

    function renderRecruiterCharts() {
        // CVs by Recruiter
        const cvData = getCVsByRecruiterData();
        renderChart('recruiterPerformanceChart', {
            type: 'bar',
            data: {
                labels: cvData.labels,
                datasets: [{
                    label: 'CVs Submitted',
                    data: cvData.values,
                    backgroundColor: '#48bb78'
                }]
            },
            options: getChartOptions('CVs Submitted by Recruiter', true)
        });

        // Positions by Recruiter
        const posData = getPositionsByRecruiterData();
        renderChart('recruiterPositionsChart', {
            type: 'bar',
            data: {
                labels: posData.labels,
                datasets: [{
                    label: 'Positions Handled',
                    data: posData.values,
                    backgroundColor: '#ed8936'
                }]
            },
            options: getChartOptions('Positions Handled by Recruiter', true)
        });
    }

    function renderClientCharts() {
        // Client Activity
        const activityData = getClientActivityData();
        renderChart('clientActivityChart', {
            type: 'bar',
            data: {
                labels: activityData.labels,
                datasets: [{
                    label: 'Total CVs',
                    data: activityData.cvs,
                    backgroundColor: '#4299e1'
                }, {
                    label: 'Positions',
                    data: activityData.positions,
                    backgroundColor: '#ed8936'
                }]
            },
            options: getChartOptions('Client Activity Overview', true)
        });

        // Average Days by Client
        const daysData = getAverageDaysByClientData();
        renderChart('clientDaysChart', {
            type: 'line',
            data: {
                labels: daysData.labels,
                datasets: [{
                    label: 'Average Days',
                    data: daysData.values,
                    borderColor: '#f56565',
                    backgroundColor: 'rgba(245, 101, 101, 0.1)',
                    fill: true
                }]
            },
            options: getChartOptions('Average Days by Client', true)
        });
    }

    function renderTimelineCharts() {
        // Timeline placeholder charts
        renderChart('timelineChart', {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Requisitions',
                    data: [12, 19, 8, 15, 22, 18],
                    borderColor: '#4299e1',
                    backgroundColor: 'rgba(66, 153, 225, 0.1)',
                    fill: true
                }]
            },
            options: getChartOptions('Requisitions Over Time', true)
        });

        renderChart('monthlyCVChart', {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'CV Submissions',
                    data: [45, 67, 34, 89, 102, 78],
                    backgroundColor: '#48bb78'
                }]
            },
            options: getChartOptions('Monthly CV Submissions', true)
        });
    }

    function renderChart(canvasId, config) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (charts[canvasId]) {
            charts[canvasId].destroy();
        }

        charts[canvasId] = new Chart(ctx, config);
    }

    function getChartOptions(title, scales = false) {
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    labels: {
                        color: '#e2e8f0'
                    }
                }
            }
        };

        if (scales) {
            options.scales = {
                x: {
                    ticks: { color: '#e2e8f0' },
                    grid: { color: '#4a5568' }
                },
                y: {
                    ticks: { color: '#e2e8f0' },
                    grid: { color: '#4a5568' }
                }
            };
        }

        return options;
    }

    // Data Processing Functions
    function getPositionStatusData() {
        const data = currentData.data || [];
        const active = data.filter(r => !r.positionOnHoldDate).length;
        const onHold = data.filter(r => r.positionOnHoldDate).length;
        
        return {
            labels: ['Active', 'On Hold'],
            values: [active, onHold]
        };
    }

    function getPositionsByClientData() {
        const data = currentData.data || [];
        const clientCounts = {};
        
        data.forEach(record => {
            const client = record.clientName || 'Unknown';
            clientCounts[client] = (clientCounts[client] || 0) + (record.noOfPosition || 1);
        });

        const sorted = Object.entries(clientCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return {
            labels: sorted.map(([client]) => client),
            values: sorted.map(([,count]) => count)
        };
    }

    function getCVsByRecruiterData() {
        const data = currentData.data || [];
        const recruiterCVs = {};
        
        data.forEach(record => {
            const recruiter = record.recruiter || 'Unknown';
            recruiterCVs[recruiter] = (recruiterCVs[recruiter] || 0) + (record.numberOfCVs || 0);
        });

        const sorted = Object.entries(recruiterCVs)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return {
            labels: sorted.map(([recruiter]) => recruiter),
            values: sorted.map(([,cvs]) => cvs)
        };
    }

    function getPositionsByRecruiterData() {
        const data = currentData.data || [];
        const recruiterPositions = {};
        
        data.forEach(record => {
            const recruiter = record.recruiter || 'Unknown';
            recruiterPositions[recruiter] = (recruiterPositions[recruiter] || 0) + (record.noOfPosition || 1);
        });

        const sorted = Object.entries(recruiterPositions)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return {
            labels: sorted.map(([recruiter]) => recruiter),
            values: sorted.map(([,positions]) => positions)
        };
    }

    function getClientActivityData() {
        const data = currentData.data || [];
        const clientStats = {};
        
        data.forEach(record => {
            const client = record.clientName || 'Unknown';
            if (!clientStats[client]) {
                clientStats[client] = { cvs: 0, positions: 0 };
            }
            clientStats[client].cvs += record.numberOfCVs || 0;
            clientStats[client].positions += record.noOfPosition || 1;
        });

        const sorted = Object.entries(clientStats)
            .sort(([,a], [,b]) => (b.cvs + b.positions) - (a.cvs + a.positions))
            .slice(0, 8);

        return {
            labels: sorted.map(([client]) => client),
            cvs: sorted.map(([,stats]) => stats.cvs),
            positions: sorted.map(([,stats]) => stats.positions)
        };
    }

    function getAverageDaysByClientData() {
        const data = currentData.data || [];
        const clientDays = {};
        
        data.forEach(record => {
            const client = record.clientName || 'Unknown';
            if (record.days !== null && record.days !== undefined) {
                if (!clientDays[client]) {
                    clientDays[client] = { total: 0, count: 0 };
                }
                clientDays[client].total += record.days;
                clientDays[client].count += 1;
            }
        });

        const averages = Object.entries(clientDays)
            .map(([client, stats]) => [client, Math.round(stats.total / stats.count)])
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8);

        return {
            labels: averages.map(([client]) => client),
            values: averages.map(([,avg]) => avg)
        };
    }

    // Search functionality for data table
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const rows = document.querySelectorAll('#dataTableBody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }

    // Export functionality
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            if (!currentData || !currentData.data) {
                alert('No data to export');
                return;
            }
            
            const csv = convertToCSV(currentData.data);
            downloadCSV(csv, 'recruitment_data.csv');
        });
    }

    function convertToCSV(data) {
        const headers = ['Recruiter', 'BDM', 'Client Name', 'Position Name', 'No Of Position', 
                        'Requisition Date', 'Number Of CVs', 'On Hold Date', 'Days', 'Remarks'];
        
        const csvContent = [
            headers.join(','),
            ...data.map(row => [
                row.recruiter || '',
                row.bdm || '',
                row.clientName || '',
                row.positionName || '',
                row.noOfPosition || '',
                row.requisitionLoggedDate || '',
                row.numberOfCVs || '',
                row.positionOnHoldDate || '',
                row.days || '',
                row.remarks || ''
            ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        return csvContent;
    }

    function downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // Initialize with placeholder charts
    setTimeout(() => {
        renderPlaceholderCharts();
    }, 100);

    function renderPlaceholderCharts() {
        const placeholderConfig = {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#4a5568']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        };

        // Render placeholder for all chart canvases
        const chartIds = ['positionStatusChart', 'positionsByClientChart', 'recruiterPerformanceChart', 
                         'recruiterPositionsChart', 'clientActivityChart', 'clientDaysChart'];
        
        chartIds.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                canvas.getContext('2d').fillStyle = '#4a5568';
                canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
            }
        });
    }
});
