// Declarative pipeline mirroring .github/workflows (CI + CD).
// Requires the Docker Pipeline plugin and a Docker-capable agent.
//
// Credentials expected:
//   - 'registry-credentials' : username/password for the container registry
// Configure via Manage Jenkins > Credentials, and set REGISTRY below.

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    REGISTRY     = 'ghcr.io'
    NODE_IMAGE   = 'node:22'
    DATABASE_URL = 'postgresql://gihtcx:gihtcx@postgres:5432/gihtcx_test?schema=public'
    REDIS_URL    = 'redis://redis:6379'
  }

  stages {
    stage('Resolve image prefix') {
      steps {
        script {
          // Derive "<owner>/<repo>" straight from the checked-out git remote,
          // so images land under the same namespace as the source with no
          // hardcoded org. e.g. https://github.com/aliabdalla-maker/goodhours
          //  -> ghcr.io/aliabdalla-maker/goodhours-<service>
          def url  = sh(script: 'git config --get remote.origin.url', returnStdout: true).trim()
          def path = url.replaceFirst(/^.*[:\/]([^\/]+\/[^\/]+?)(?:\.git)?$/, '$1').toLowerCase()
          env.IMAGE_PREFIX = path
          echo "Images -> ${REGISTRY}/${env.IMAGE_PREFIX}-<service>"
        }
      }
    }
    stage('Install, verify & test') {
      steps {
        script {
          // Ephemeral Postgres + Redis, reachable by hostname from the build container.
          docker.image('postgres:16-alpine').withRun(
            '-e POSTGRES_USER=gihtcx -e POSTGRES_PASSWORD=gihtcx -e POSTGRES_DB=gihtcx_test'
          ) { pg ->
            docker.image('redis:7-alpine').withRun() { redis ->
              docker.image(env.NODE_IMAGE).inside("--link ${pg.id}:postgres --link ${redis.id}:redis") {
                sh 'node --version'
                sh 'npm ci'
                sh 'npm run db:generate'
                // Wait for Postgres, then apply migrations.
                sh '''
                  for i in $(seq 1 30); do
                    node -e "require('net').connect(5432,'postgres').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" && break
                    sleep 2
                  done
                '''
                sh 'npm run db:deploy'
                sh 'npm run db:drift'          // fails on schema/migration drift
                sh 'npm run lint || true'      // non-blocking until ESLint lands
                sh 'npm run typecheck'
                sh 'npm test'
                sh 'npm run test:integration'
                sh 'NEXT_PUBLIC_API_URL=http://localhost:4000 npm run build'
              }
            }
          }
        }
      }
    }

    stage('Build images') {
      steps {
        script {
          for (svc in ['api', 'web', 'worker']) {
            def args = svc == 'web' ? '--build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 ' : ''
            sh "docker build ${args}-f packages/${svc}/Dockerfile -t ${IMAGE_PREFIX}-${svc}:${GIT_COMMIT.take(7)} ."
          }
        }
      }
    }

    stage('Publish images') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
          buildingTag()
        }
      }
      steps {
        script {
          def tag = env.TAG_NAME ? env.TAG_NAME.replaceFirst(/^v/, '') : "sha-${GIT_COMMIT.take(7)}"
          docker.withRegistry("https://${REGISTRY}", 'registry-credentials') {
            for (svc in ['api', 'web', 'worker']) {
              def img = docker.build(
                "${REGISTRY}/${IMAGE_PREFIX}-${svc}:${tag}",
                (svc == 'web' ? '--build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 ' : '') +
                  "-f packages/${svc}/Dockerfile ."
              )
              img.push(tag)
              if (env.TAG_NAME) { img.push('latest') } else { img.push('edge') }
            }
          }
        }
      }
    }

    stage('Deploy') {
      when { buildingTag() }
      steps {
        // Wire to your host: SSH + `docker compose pull && up -d`, or a k8s rollout.
        echo "Images published for ${env.TAG_NAME}. Configure the production rollout here."
      }
    }
  }

  post {
    always {
      sh 'docker image prune -f || true'
      cleanWs()
    }
  }
}
