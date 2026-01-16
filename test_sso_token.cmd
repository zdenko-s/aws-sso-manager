REM Copy/paste variables from web page
set AWS_ACCESS_KEY_ID=
set AWS_SECRET_ACCESS_KEY=
set AWS_SESSION_TOKEN=
aws ec2 describe-instances --region eu-west-1 --output text --query "Reservations[*].Instances[*].{Instance:InstanceId,NameE:Tags[?Key=='Name']|[0].Value}"
rem aws ec2 describe-instances --region eu-central-1 --profile prod-dev --output text --query "Reservations[*].Instances[*].{Instance:InstanceId,NameE:Tags[?Key=='Name']|[0].Value}"